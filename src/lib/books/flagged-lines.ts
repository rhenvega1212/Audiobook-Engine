/** Lines that still need a human pass in Review / manuscript. */
export function lineNeedsHumanReview(line: {
  flag_reason: string | null;
  human_reviewed?: boolean | null;
}): boolean {
  return !!line.flag_reason?.trim() && !line.human_reviewed;
}

export function countUnresolvedFlags(
  lines: { flag_reason: string | null; human_reviewed?: boolean | null }[]
): number {
  return lines.filter(lineNeedsHumanReview).length;
}

/** Resolved by AI or human but flag_reason kept as audit text. */
export function isResolvedFlagAudit(line: {
  flag_reason: string | null;
  human_reviewed?: boolean | null;
}): boolean {
  return !!line.flag_reason?.trim() && !!line.human_reviewed;
}
