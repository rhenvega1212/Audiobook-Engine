/** Only auto-clear flags when Claude is highly confident. */
export function shouldClearFlagAfterApply(
  speaker: string,
  confidence: string,
  hadFlag: boolean
): boolean {
  if (!hadFlag) return false;
  if (speaker === "UNKNOWN") return false;
  return confidence === "high";
}

export function flagReasonAfterApply(
  oldSpeaker: string,
  newSpeaker: string,
  oldFlag: string | null,
  confidence: string,
  clearFlag: boolean
): string | null {
  if (clearFlag) return null;
  if (newSpeaker !== oldSpeaker) {
    return `ai_reviewed (was: ${oldFlag ?? "none"}; changed: ${oldSpeaker} → ${newSpeaker})`;
  }
  if (oldFlag) return `ai_confirmed (was: ${oldFlag})`;
  if (confidence === "low" || confidence === "medium") {
    return "ai_re_review_uncertain";
  }
  return oldFlag;
}

export type AiReviewProposal = {
  line_id: string;
  global_index: number;
  line_order: number;
  old_speaker: string;
  new_speaker: string;
  confidence: string;
  line_text: string;
  flag_reason: string | null;
  changed: boolean;
};

export type AiReviewApplyItem = {
  line_id: string;
  speaker: string;
  confidence: string;
  accept: boolean;
};
