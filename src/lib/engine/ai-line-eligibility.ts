import type { TaggedLine } from "./types";

export type TaggedLineForAi = TaggedLine & {
  ai_reviewed?: boolean;
  human_reviewed?: boolean;
};

export type AiPassOptions = {
  /** Re-process lines Claude already reviewed (still skips human_reviewed unless fullScrub). */
  includeAiReviewed?: boolean;
  /** When false, includes human_reviewed lines (raw scrub). Default true. */
  respectHumanReviewed?: boolean;
  /** Review every line in scope, not only flagged / uncertain. */
  fullScrub?: boolean;
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

/** True when automation used weak inference — eligible for AI re-check. */
export function isWeakAttributionFlag(flagReason: string | null | undefined): boolean {
  if (!flagReason) return false;
  const f = flagReason.toLowerCase();
  return (
    f.includes("pronoun_only") ||
    f.includes("back_and_forth") ||
    f.includes("first_name_resolved") ||
    f.includes("name_without_dialogue") ||
    f.includes("inferred_from_context") ||
    f.includes("unattributed_back_and_forth") ||
    f.includes("unattributed_dialogue_inferred")
  );
}

/** Dialogue-shaped text wrongly stored without a character speaker. */
export function lineLooksLikeQuotedDialogue(line: TaggedLineForAi): boolean {
  const t = line.line.trim();
  if (!t) return false;
  if (/^["'\u201C\u201D\u2018\u2019]/.test(t)) return true;
  if (/["'\u201C\u201D\u2018\u2019]$/.test(t)) return true;
  if (/^["'\u201C]/.test(t) && !/["'\u201D]$/.test(t)) return true;
  return false;
}

/** Reject speaker flips that undo a good prior assignment (defense in depth). */
export function shouldProposeSpeakerChange(
  line: TaggedLineForAi,
  oldSpeaker: string,
  newSpeaker: string,
  options?: Pick<AiPassOptions, "fullScrub" | "respectHumanReviewed">
): boolean {
  if (
    options?.fullScrub === true &&
    options?.respectHumanReviewed === false
  ) {
    return true;
  }
  if (oldSpeaker === newSpeaker) return true;
  if (
    newSpeaker !== "Narrator" ||
    oldSpeaker === "Narrator" ||
    oldSpeaker === "UNKNOWN"
  ) {
    return true;
  }
  if (isSettledAiAssignment(line)) return false;
  if (isWeakAttributionFlag(line.flag_reason)) return true;
  if (line.ai_reviewed && lineLooksLikeQuotedDialogue(line)) return true;
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
  if (options?.respectHumanReviewed !== false && line.human_reviewed) {
    return false;
  }
  if (options?.previewProcessed?.has(globalIndex)) return false;
  if (options?.eligibleIndices && !options.eligibleIndices.has(globalIndex)) {
    return false;
  }

  if (options?.fullScrub) {
    return true;
  }

  if (isSettledAiAssignment(line)) return false;

  if (
    line.speaker === "Narrator" &&
    lineLooksLikeQuotedDialogue(line) &&
    !line.human_reviewed
  ) {
    return true;
  }

  if (options?.includeAiReviewed && line.ai_reviewed) {
    return (
      !!line.flag_reason ||
      line.speaker === "UNKNOWN" ||
      line.confidence !== "high" ||
      isWeakAttributionFlag(line.flag_reason)
    );
  }

  if (line.ai_reviewed && isWeakAttributionFlag(line.flag_reason)) {
    return true;
  }

  if (
    !line.ai_reviewed &&
    line.confidence !== "high" &&
    line.speaker !== "Narrator"
  ) {
    return true;
  }
  return !!line.flag_reason && !line.ai_reviewed;
}
