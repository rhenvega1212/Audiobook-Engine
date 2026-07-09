/**
 * Real correction examples from editorial review — injected into AI attribution prompts.
 * Source: Audiobook_Engine_-_Voice_Assignment_Corrections.xlsx
 */
export type AttributionCorrectionExample = {
  line_order: number;
  wrong: string;
  correct: string;
  why: string;
};

export const ATTRIBUTION_CORRECTION_EXAMPLES: AttributionCorrectionExample[] = [
  {
    line_order: 73,
    wrong: "Nikki",
    correct: "Derek",
    why: "Derek did not finish his line — he said \"yep\" and sat down, then continued on this line.",
  },
  {
    line_order: 74,
    wrong: "Derek",
    correct: "Nikki",
    why: "This line is Nikki's response to Derek's previous line (two-person exchange).",
  },
  {
    line_order: 105,
    wrong: "Isabel",
    correct: "Nikki",
    why: "Derek and Nikki are still talking; Nikki is referencing Isabel, not speaking as Isabel.",
  },
  {
    line_order: 106,
    wrong: "Kristof",
    correct: "Derek",
    why: "Kristof is mentioned in the next line, but only Derek and Nikki are in this conversation — Derek is replying to Nikki.",
  },
  {
    line_order: 121,
    wrong: "Derek",
    correct: "Nikki",
    why: "Nikki is responding to Derek's line immediately before.",
  },
  {
    line_order: 127,
    wrong: "Derek",
    correct: "Nikki",
    why: "Nikki is responding to Derek inviting her to the wedding.",
  },
  {
    line_order: 133,
    wrong: "Susan",
    correct: "Nikki",
    why: "Continuing thought / same utterance as the previous Nikki line.",
  },
  {
    line_order: 139,
    wrong: "Narrator",
    correct: "Nikki",
    why: "Quote was split mid-speech — this is still Nikki's dialogue continuing from the prior line.",
  },
  {
    line_order: 171,
    wrong: "Susan",
    correct: "Andres",
    why: "Nikki spotted Andres; Andres crossed over and asked the question.",
  },
  {
    line_order: 202,
    wrong: "Nikki",
    correct: "Isabel",
    why: "Isabel is responding to Nikki's statement on the previous line.",
  },
  {
    line_order: 223,
    wrong: "Narrator",
    correct: "Nikki",
    why: "Quoted reply to Isabel's joke on the previous line — not narration.",
  },
  {
    line_order: 224,
    wrong: "Narrator",
    correct: "Nikki",
    why: "Continuation of Nikki's reply to Isabel (same speech as line 223).",
  },
];

export function formatAttributionExamplesForPrompt(
  examples: AttributionCorrectionExample[] = ATTRIBUTION_CORRECTION_EXAMPLES
): string {
  const rows = examples
    .map(
      (ex) =>
        `- Line ~${ex.line_order}: was "${ex.wrong}" → should be "${ex.correct}" — ${ex.why}`
    )
    .join("\n");

  return `EDITORIAL CORRECTION EXAMPLES (learn these patterns):
${rows}`;
}
