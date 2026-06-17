/** Group tagged lines into document paragraphs for cleanup / doc view. */

import { isChapterHeadingText } from "@/lib/books/book-chapters";
import { formatLineForManuscript } from "@/lib/engine/quote-spans";

export type DocumentBlock = {
  id: string;
  paragraph_num: number;
  line_ids: string[];
  text: string;
  isHeading: boolean;
  excluded_from_export: boolean;
};

type LineSlice = {
  id: string;
  line_order: number;
  paragraph_num: number;
  line_text: string;
  speaker_label?: string;
  excluded_from_export?: boolean;
};

/** One block per source paragraph — text is all lines joined for that paragraph. */
export function buildDocumentBlocks(
  lines: LineSlice[],
  sourceParagraphs?: string[]
): DocumentBlock[] {
  if (!lines?.length) return [];

  const sorted = [...lines].sort((a, b) => a.line_order - b.line_order);
  const byPara = new Map<number, LineSlice[]>();

  for (const line of sorted) {
    const bucket = byPara.get(line.paragraph_num) ?? [];
    bucket.push(line);
    byPara.set(line.paragraph_num, bucket);
  }

  const paraNums = [...byPara.keys()].sort((a, b) => a - b);

  return paraNums.map((paraNum) => {
    const group = byPara.get(paraNum)!;
    const sourceText = sourceParagraphs?.[paraNum]?.trim();
    const text =
      sourceText ??
      group
        .map((l) => {
          const trimmed = l.line_text.trim();
          if (!trimmed) return "";
          return l.speaker_label
            ? formatLineForManuscript(trimmed, l.speaker_label)
            : trimmed;
        })
        .filter(Boolean)
        .join(" ");
    const excluded = group.every((l) => l.excluded_from_export);

    return {
      id: `p-${paraNum}-${group[0]!.id}`,
      paragraph_num: paraNum,
      line_ids: group.map((l) => l.id),
      text,
      isHeading: isChapterHeadingText(text),
      excluded_from_export: excluded,
    };
  });
}

/** Paragraph strings in order — for re-tagging after cleanup. */
export function paragraphsFromLines(
  lines: LineSlice[],
  sourceParagraphs?: string[]
): string[] {
  return buildDocumentBlocks(lines, sourceParagraphs)
    .map((b) => b.text.trim())
    .filter(Boolean);
}

/** Map paragraph index → original paragraph_num for chapter rebuild hints. */
export function chapterParagraphIndices(paragraphs: string[]): Set<number> {
  const nums = new Set<number>();
  paragraphs.forEach((text, i) => {
    if (isChapterHeadingText(text)) nums.add(i);
  });
  return nums;
}
