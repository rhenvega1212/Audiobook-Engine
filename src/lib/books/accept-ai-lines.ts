import type { TaggedLine } from "@/lib/types/database";

export type AcceptAiCandidate = {
  id: string;
  line_order: number;
  speaker_label: string;
  line_text: string;
  flag_reason: string | null;
  confidence: string | null;
  ai_reviewed: boolean;
};

export function isEligibleForAcceptAi(line: {
  flag_reason: string | null;
  ai_reviewed: boolean | null;
  confidence: string | null;
}): boolean {
  const fr = line.flag_reason ?? "";
  if (!fr) return false;
  if (!line.ai_reviewed) return false;
  return (
    fr.startsWith("ai_confirmed") ||
    fr.includes("ai_reviewed") ||
    line.confidence === "high" ||
    line.confidence === "medium"
  );
}

export function listAcceptAiCandidates(
  lines: Pick<
    TaggedLine,
    | "id"
    | "line_order"
    | "speaker_label"
    | "line_text"
    | "flag_reason"
    | "confidence"
    | "ai_reviewed"
  >[]
): AcceptAiCandidate[] {
  return lines
    .filter(isEligibleForAcceptAi)
    .map((l) => ({
      id: l.id,
      line_order: l.line_order,
      speaker_label: l.speaker_label,
      line_text: l.line_text,
      flag_reason: l.flag_reason,
      confidence: l.confidence,
      ai_reviewed: l.ai_reviewed ?? false,
    }));
}
