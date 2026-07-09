import mammoth from "mammoth";
import { isChapterHeadingText } from "@/lib/books/book-chapters";

export type ManuscriptBlockKind = "heading" | "paragraph" | "list";

export type ManuscriptBlock = {
  text: string;
  kind: ManuscriptBlockKind;
  /** 1–6 for Word heading styles mapped to h1–h6 */
  headingLevel?: number;
};

const MAMMOTH_STYLE_MAP = [
  "p[style-name='Heading 1'] => h1:fresh",
  "p[style-name='Heading 2'] => h2:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "p[style-name='Heading 4'] => h4:fresh",
  "p[style-name='Heading 5'] => h5:fresh",
  "p[style-name='Heading 6'] => h6:fresh",
  "p[style-name='Chapter Heading'] => h1:fresh",
  "p[style-name='chapter heading'] => h1:fresh",
  "p[style-name='Chapter Title'] => h1:fresh",
].join("\n");

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripInlineTags(html: string): string {
  return decodeHtmlEntities(
    html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")
  )
    .replace(/\u00a0/g, " ")
    .trim();
}

/** Extract ordered blocks from mammoth HTML — headings, paragraphs, list items. */
export function extractBlocksFromHtml(html: string): ManuscriptBlock[] {
  const blocks: ManuscriptBlock[] = [];
  const re = /<(h[1-6]|p|li)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = re.exec(html)) !== null) {
    const tag = match[1]!.toLowerCase();
    const text = stripInlineTags(match[2]!);
    if (!text) continue;

    if (tag.startsWith("h")) {
      blocks.push({
        text,
        kind: "heading",
        headingLevel: parseInt(tag.charAt(1), 10),
      });
    } else if (tag === "li") {
      blocks.push({ text, kind: "list" });
    } else {
      blocks.push({ text, kind: "paragraph" });
    }
  }

  return blocks;
}

/** True when a docx block should start a new chapter in the studio. */
export function isLikelyChapterBlock(block: ManuscriptBlock): boolean {
  const t = block.text.trim();
  if (!t) return false;
  if (isChapterHeadingText(t)) return true;
  if (block.kind === "heading" && block.headingLevel === 1) {
    return /^chapter\s+\d+/i.test(t);
  }
  return false;
}

function blocksFromRawText(rawText: string): ManuscriptBlock[] {
  return rawText
    .replace(/\r\n/g, "\n")
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((text) => ({ text, kind: "paragraph" as const }));
}

/** Full verbatim extract from a .docx buffer. */
export async function extractManuscriptBlocks(
  buffer: Buffer
): Promise<{
  blocks: ManuscriptBlock[];
  paragraphs: string[];
  chapterParagraphNums: Set<number>;
  rawText: string;
  blockCount: number;
}> {
  const { value: html } = await mammoth.convertToHtml(
    { buffer },
    { styleMap: MAMMOTH_STYLE_MAP }
  );
  let blocks = extractBlocksFromHtml(html);

  const { value: rawText } = await mammoth.extractRawText({ buffer });
  const rawBlocks = blocksFromRawText(rawText);

  // Prefer HTML structure when it captures enough content; else raw lines
  if (blocks.length < Math.max(1, rawBlocks.length * 0.85)) {
    blocks = rawBlocks;
  }

  const chapterParagraphNums = new Set<number>();
  blocks.forEach((block, i) => {
    if (isLikelyChapterBlock(block)) {
      chapterParagraphNums.add(i);
    }
  });

  const paragraphs = blocks.map((b) => b.text);

  return {
    blocks,
    paragraphs,
    chapterParagraphNums,
    rawText,
    blockCount: paragraphs.length,
  };
}

/** @deprecated Use extractManuscriptBlocks — kept for callers that only need strings. */
export async function extractManuscriptParagraphs(
  buffer: Buffer
): Promise<{ paragraphs: string[]; rawText: string; blockCount: number }> {
  const { paragraphs, rawText, blockCount } = await extractManuscriptBlocks(buffer);
  return { paragraphs, rawText, blockCount };
}

/**
 * Compare source paragraphs to emitted lines — flags dropped wording.
 *
 * Word coverage is measured **globally** (whole-manuscript word multiset) rather
 * than per source paragraph. The rules engine legitimately moves words across
 * paragraph boundaries — most notably `coalesceNarratorRuns`, which merges runs
 * of consecutive Narrator paragraphs into a single line under the first
 * paragraph's `paragraph_num`. A strict per-paragraph bucket check treats those
 * relocated words as "missing" and produces a large false coverage drop on
 * narration-heavy manuscripts, even though no text was actually lost.
 */
export function measureManuscriptCoverage(
  paragraphs: string[],
  lines: { line: string; paragraph_num: number }[]
): {
  paragraph_coverage: number;
  word_coverage: number;
  thin_paragraphs: number[];
} {
  // Global multiset of emitted words — a word can be matched as many times as it
  // was emitted, no more. This tolerates cross-paragraph merges while still
  // detecting genuinely dropped text.
  const emittedCounts = new Map<string, number>();
  for (const line of lines) {
    for (const word of normalizeWords(line.line)) {
      emittedCounts.set(word, (emittedCounts.get(word) ?? 0) + 1);
    }
  }
  const emittedSet = new Set(emittedCounts.keys());

  const sourceCounts = new Map<string, number>();
  let sourceWords = 0;
  for (const p of paragraphs) {
    for (const word of normalizeWords(p)) {
      sourceCounts.set(word, (sourceCounts.get(word) ?? 0) + 1);
      sourceWords++;
    }
  }

  let matchedWords = 0;
  for (const [word, count] of sourceCounts) {
    matchedWords += Math.min(count, emittedCounts.get(word) ?? 0);
  }

  // Per-paragraph diagnostic (message only): a paragraph is "thin" when its
  // words are largely absent from the emitted output anywhere, which points at
  // real extraction loss rather than mere relocation.
  let coveredParas = 0;
  const thin: number[] = [];
  let nonEmpty = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    const source = normalizeWords(paragraphs[i]!);
    if (source.length === 0) continue;
    nonEmpty++;
    const present = source.filter((w) => emittedSet.has(w)).length;
    if (present / source.length >= 0.95) coveredParas++;
    else thin.push(i);
  }

  return {
    paragraph_coverage: nonEmpty > 0 ? coveredParas / nonEmpty : 1,
    word_coverage: sourceWords > 0 ? matchedWords / sourceWords : 1,
    thin_paragraphs: thin.slice(0, 20),
  };
}

function normalizeWords(text: string): string[] {
  return (
    text
      .toLowerCase()
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      .match(/[\w']+/g) ?? []
  );
}
