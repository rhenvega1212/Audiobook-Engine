export type AiConfidence = "high" | "medium" | "low" | "none";

const CONFIDENCE_VALUES = new Set<AiConfidence>([
  "high",
  "medium",
  "low",
  "none",
]);

/** Coerce Claude / UI confidence strings to a valid DB enum value. */
export function normalizeAiConfidence(confidence: string): AiConfidence {
  const lower = confidence.trim().toLowerCase();
  if (CONFIDENCE_VALUES.has(lower as AiConfidence)) {
    return lower as AiConfidence;
  }
  return "medium";
}
