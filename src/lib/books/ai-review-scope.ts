import type { BookChapterRow } from "@/lib/books/book-chapters";

export type AiReviewScope =
  | { type: "flagged" }
  | { type: "chapter"; chapterId: string };

export type LineForScope = {
  id: string;
  line_order: number;
};

/** Global line indices Claude may change for this run. */
export function eligibleLineIndices(
  lines: LineForScope[],
  scope: AiReviewScope,
  chapters: BookChapterRow[]
): Set<number> {
  if (scope.type === "flagged") {
    return new Set(lines.map((_, i) => i));
  }

  const chapter = chapters.find((c) => c.id === scope.chapterId);
  if (!chapter) return new Set();

  const sorted = [...chapters].sort(
    (a, b) => a.start_line_order - b.start_line_order
  );
  const idx = sorted.findIndex((c) => c.id === scope.chapterId);
  const next = idx >= 0 ? sorted[idx + 1] : undefined;
  const start = chapter.start_line_order;
  const end = next?.start_line_order ?? Number.MAX_SAFE_INTEGER;

  const eligible = new Set<number>();
  lines.forEach((line, i) => {
    if (line.line_order >= start && line.line_order < end) {
      eligible.add(i);
    }
  });
  return eligible;
}

export function scopeLabel(
  scope: AiReviewScope,
  chapters: BookChapterRow[]
): string {
  if (scope.type === "flagged") return "Flagged lines only (whole book)";
  const ch = chapters.find((c) => c.id === scope.chapterId);
  return ch ? `Chapter: ${ch.title}` : "Selected chapter";
}
