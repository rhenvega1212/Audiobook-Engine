import type { TaggedLine } from "./types";

export type TaggedLineForAi = TaggedLine & {
  ai_reviewed?: boolean;
  human_reviewed?: boolean;
};

export type AiPassOptions = {
  /** Re-process lines Claude already reviewed (still skips human_reviewed). */
  includeAiReviewed?: boolean;
  /** Global indices Claude may change (scope filter). */
  eligibleIndices?: Set<number>;
  /** Lines already handled in this preview run (avoids duplicate batches). */
  previewProcessed?: Set<number>;
};

/** High-confidence AI pass with flag cleared — keep on re-runs. */
export function isSettledAiAssignment(line: TaggedLineForAi): boolean {
  return (
    !!line.ai_reviewed &&
    !line.flag_reason &&
    line.confidence === "high" &&
    !line.human_reviewed
  );
}

/** Reject speaker flips that undo a good prior assignment (defense in depth). */
export function shouldProposeSpeakerChange(
  line: TaggedLineForAi,
  oldSpeaker: string,
  newSpeaker: string
): boolean {
  if (oldSpeaker === newSpeaker) return true;
  if (
    newSpeaker !== "Narrator" ||
    oldSpeaker === "Narrator" ||
    oldSpeaker === "UNKNOWN"
  ) {
    return true;
  }
  if (isSettledAiAssignment(line)) return false;
  if (line.confidence === "high" && !line.flag_reason) return false;
  const text = line.line.trim();
  if (/["'\u201C\u201D\u2018\u2019]/.test(text)) return false;
  return true;
}

/** True when this line still needs a Claude attribution pass. */
export function lineNeedsAiPass(
  line: TaggedLineForAi,
  globalIndex: number,
  options?: AiPassOptions
): boolean {
  if (line.human_reviewed) return false;
  if (options?.previewProcessed?.has(globalIndex)) return false;
  if (options?.eligibleIndices && !options.eligibleIndices.has(globalIndex)) {
    return false;
  }
  if (isSettledAiAssignment(line)) return false;
  if (options?.includeAiReviewed && line.ai_reviewed) {
    return (
      !!line.flag_reason ||
      line.speaker === "UNKNOWN" ||
      line.confidence !== "high"
    );
  }
  return !!line.flag_reason && !line.ai_reviewed;
}
