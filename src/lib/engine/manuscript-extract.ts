import mammoth from "mammoth";

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
  return decodeHtmlEntities(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""))
    .replace(/\u00a0/g, " ")
    .trim();
}

/** Extract ordered blocks from mammoth HTML — headings, paragraphs, list items. */
export function extractBlocksFromHtml(html: string): string[] {
  const blocks: string[] = [];
  const re =
    /<(h[1-6]|p|li)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = re.exec(html)) !== null) {
    const text = stripInlineTags(match[2]!);
    if (text) blocks.push(text);
  }

  return blocks;
}

/** Extract paragraph blocks from a .docx buffer (verbatim — no block types dropped). */
export async function extractManuscriptParagraphs(
  buffer: Buffer
): Promise<{ paragraphs: string[]; rawText: string; blockCount: number }> {
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const fromHtml = extractBlocksFromHtml(html);

  const { value: rawText } = await mammoth.extractRawText({ buffer });
  const fromText = rawText
    .replace(/\r\n/g, "\n")
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  // Prefer HTML blocks when they capture structure; fall back to raw text lines
  const paragraphs =
    fromHtml.length >= Math.max(1, fromText.length * 0.85)
      ? fromHtml
      : fromText;

  return { paragraphs, rawText, blockCount: paragraphs.length };
}

/** Compare source paragraphs to emitted lines — flags dropped wording. */
export function measureManuscriptCoverage(
  paragraphs: string[],
  lines: { line: string; paragraph_num: number }[]
): {
  paragraph_coverage: number;
  word_coverage: number;
  thin_paragraphs: number[];
} {
  const byPara = new Map<number, string[]>();
  for (const line of lines) {
    const bucket = byPara.get(line.paragraph_num) ?? [];
    bucket.push(line.line);
    byPara.set(line.paragraph_num, bucket);
  }

  let coveredParas = 0;
  const thin: number[] = [];
  let sourceWords = 0;
  let matchedWords = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const source = normalizeWords(paragraphs[i]!);
    sourceWords += source.length;
    if (source.length === 0) continue;

    const emitted = normalizeWords((byPara.get(i) ?? []).join(" "));
    let hits = 0;
    const used = new Set<number>();
    for (const word of source) {
      for (let j = 0; j < emitted.length; j++) {
        if (!used.has(j) && emitted[j] === word) {
          used.add(j);
          hits++;
          break;
        }
      }
    }
    matchedWords += hits;

    const ratio = hits / source.length;
    if (ratio >= 0.95) coveredParas++;
    else thin.push(i);
  }

  const nonEmpty = paragraphs.filter((p) => normalizeWords(p).length > 0).length;

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
