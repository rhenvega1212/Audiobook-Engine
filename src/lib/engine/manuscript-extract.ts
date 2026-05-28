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

/** Extract paragraph blocks from a .docx buffer. */
export async function extractManuscriptParagraphs(
  buffer: Buffer
): Promise<{ paragraphs: string[]; rawText: string }> {
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const fromHtml = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => decodeHtmlEntities(m[1].replace(/<[^>]+>/g, "")).trim())
    .filter(Boolean);

  const { value: rawText } = await mammoth.extractRawText({ buffer });
  const fromText = rawText
    .replace(/\r\n/g, "\n")
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const paragraphs =
    fromHtml.length >= fromText.length * 0.9 ? fromHtml : fromText;

  return { paragraphs, rawText };
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
    const source = normalizeWords(paragraphs[i]);
    sourceWords += source.length;
    if (source.length === 0) continue;

    const emitted = normalizeWords((byPara.get(i) ?? []).join(" "));
    let hits = 0;
    for (const word of source) {
      if (emitted.includes(word)) hits++;
    }
    matchedWords += hits;

    const ratio = hits / source.length;
    if (ratio >= 0.85) coveredParas++;
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
  return text
    .toLowerCase()
    .replace(/[""]/g, '"')
    .match(/[\w']+/g) ?? [];
}
