import type { ManuscriptLine } from "@/lib/manuscript/types";

/** Reorder lines in memory (sorted by line_order). Inserts before target line. */
export function reorderManuscriptLines(
  lines: ManuscriptLine[],
  draggedId: string,
  targetId: string
): ManuscriptLine[] | null {
  if (draggedId === targetId) return null;

  const sorted = [...lines].sort((a, b) => a.line_order - b.line_order);
  const fromIdx = sorted.findIndex((l) => l.id === draggedId);
  const toIdx = sorted.findIndex((l) => l.id === targetId);
  if (fromIdx < 0 || toIdx < 0) return null;

  const next = [...sorted];
  const [removed] = next.splice(fromIdx, 1);
  let insertAt = toIdx;
  if (fromIdx < toIdx) insertAt -= 1;
  next.splice(insertAt, 0, removed!);

  return next.map((line, i) => ({ ...line, line_order: i }));
}

export function targetLineOrderForDrop(
  lines: ManuscriptLine[],
  draggedId: string,
  targetId: string
): number | null {
  const reordered = reorderManuscriptLines(lines, draggedId, targetId);
  if (!reordered) return null;
  const moved = reordered.find((l) => l.id === draggedId);
  return moved?.line_order ?? null;
}
