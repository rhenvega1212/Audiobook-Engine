import { isChapterHeadingText } from "@/lib/books/book-chapters";

/** View all lines without chapter scoping */
export const MANUSCRIPT_FULL_ID = "__full__";

export type ManuscriptChapter = {
  id: string;
  title: string;
  startLineOrder: number;
  endLineOrder: number;
  firstLineId: string;
  lineCount: number;
};

type LineSlice = {
  id: string;
  line_order: number;
  line_text: string;
};

function isChapterHeading(text: string): boolean {
  return isChapterHeadingText(text);
}

function chapterTitle(text: string): string {
  const t = text.trim();
  return t.length > 72 ? `${t.slice(0, 72)}…` : t;
}

/** Split manuscript lines into chapters using chapter-heading lines from analysis. */
export function buildManuscriptChapters(lines: LineSlice[]): ManuscriptChapter[] {
  if (lines.length === 0) return [];

  const chapters: ManuscriptChapter[] = [];
  let segmentStart = 0;

  const pushSegment = (endIdx: number, title: string) => {
    if (endIdx < segmentStart) return;
    const start = lines[segmentStart]!;
    const end = lines[endIdx]!;
    chapters.push({
      id: `ch-${chapters.length}`,
      title,
      startLineOrder: start.line_order,
      endLineOrder: end.line_order,
      firstLineId: start.id,
      lineCount: endIdx - segmentStart + 1,
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!isChapterHeading(line.line_text)) continue;

    if (i > segmentStart) {
      const title =
        segmentStart === 0
          ? "Front matter"
          : chapterTitle(lines[segmentStart]!.line_text);
      pushSegment(i - 1, title);
    }

    segmentStart = i;
  }

  if (segmentStart < lines.length) {
    const head = lines[segmentStart]!.line_text;
    const title = isChapterHeading(head)
      ? chapterTitle(head)
      : segmentStart === 0
        ? "Full manuscript"
        : "Continued";
    pushSegment(lines.length - 1, title);
  }

  return chapters;
}

export function findChapterForLine(
  chapters: ManuscriptChapter[],
  lineOrder: number
): ManuscriptChapter | undefined {
  return chapters.find(
    (c) => lineOrder >= c.startLineOrder && lineOrder <= c.endLineOrder
  );
}

export function filterLinesByChapter<T extends { line_order: number }>(
  lines: T[],
  chapter: ManuscriptChapter | null
): T[] {
  if (!chapter) return lines;
  return lines.filter(
    (l) =>
      l.line_order >= chapter.startLineOrder &&
      l.line_order <= chapter.endLineOrder
  );
}
