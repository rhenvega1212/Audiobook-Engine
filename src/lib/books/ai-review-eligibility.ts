import {
  lineNeedsAiPass,
  type TaggedLineForAi,
} from "@/lib/engine/ai-line-eligibility";
import {
  type AiReviewScope,
  eligibleLineIndices,
} from "@/lib/books/ai-review-scope";
import type { BookChapterRow } from "@/lib/books/book-chapters";

export type LineForAiEligibility = {
  line_order: number;
  flag_reason: string | null;
  ai_reviewed?: boolean;
  human_reviewed?: boolean;
  confidence?: string | null;
  speaker_label: string;
  line_text: string;
  paragraph_num: number;
};

export type AiReviewEligibilityStats = {
  /** Lines with any flag_reason set (book page “flagged” count). */
  flagged_count: number;
  /** Lines Claude would review with current scope and options. */
  eligible_for_ai: number;
  /** Flagged but you already confirmed in Review / Speaker studio. */
  human_reviewed_flagged: number;
  /** Flagged and AI-reviewed once; skipped unless re-check is enabled. */
  ai_reviewed_still_flagged: number;
  /** Flagged, not yet AI-reviewed — typical first AI pass. */
  flagged_not_ai_reviewed: number;
};

function toEngineLine(l: LineForAiEligibility): TaggedLineForAi {
  return {
    speaker: l.speaker_label,
    line: l.line_text,
    paragraph_num: l.paragraph_num,
    confidence: (l.confidence ?? "none") as TaggedLineForAi["confidence"],
    flag_reason: l.flag_reason,
    ai_reviewed: l.ai_reviewed ?? false,
    human_reviewed: l.human_reviewed ?? false,
  };
}

export function summarizeAiReviewEligibility(
  lines: LineForAiEligibility[],
  scope: AiReviewScope,
  chapters: BookChapterRow[],
  includeAiReviewed: boolean
): AiReviewEligibilityStats {
  const flagged = lines.filter((l) => l.flag_reason);
  const eligibleIndices = eligibleLineIndices(
    lines.map((l) => ({ id: "", line_order: l.line_order })),
    scope,
    chapters
  );

  let eligible_for_ai = 0;
  const engineLines = lines.map(toEngineLine);
  for (let i = 0; i < engineLines.length; i++) {
    if (
      lineNeedsAiPass(engineLines[i]!, i, {
        eligibleIndices,
        includeAiReviewed,
      })
    ) {
      eligible_for_ai++;
    }
  }

  const human_reviewed_flagged = flagged.filter((l) => l.human_reviewed).length;
  const ai_reviewed_still_flagged = flagged.filter(
    (l) => l.ai_reviewed && !l.human_reviewed
  ).length;
  const flagged_not_ai_reviewed = flagged.filter(
    (l) => !l.ai_reviewed && !l.human_reviewed
  ).length;

  return {
    flagged_count: flagged.length,
    eligible_for_ai,
    human_reviewed_flagged,
    ai_reviewed_still_flagged,
    flagged_not_ai_reviewed,
  };
}

export function describeAiEligibility(stats: AiReviewEligibilityStats): string {
  if (stats.flagged_count === 0) {
    return "No lines are currently flagged. The rules engine and your manual review may have cleared them all.";
  }
  if (stats.eligible_for_ai === 0) {
    const parts: string[] = [];
    if (stats.human_reviewed_flagged > 0) {
      parts.push(
        `${stats.human_reviewed_flagged.toLocaleString()} flagged line${stats.human_reviewed_flagged === 1 ? " is" : "s are"} already human-reviewed (AI skips those)`
      );
    }
    if (stats.ai_reviewed_still_flagged > 0) {
      parts.push(
        `${stats.ai_reviewed_still_flagged.toLocaleString()} flagged line${stats.ai_reviewed_still_flagged === 1 ? " was" : "s were"} already AI-reviewed — enable “re-check uncertain” to include them`
      );
    }
    if (parts.length === 0) {
      return `${stats.flagged_count.toLocaleString()} line${stats.flagged_count === 1 ? " is" : "s are"} flagged in this scope, but none match the current AI filters.`;
    }
    return parts.join(". ") + ".";
  }
  return `${stats.eligible_for_ai.toLocaleString()} line${stats.eligible_for_ai === 1 ? "" : "s"} ready for AI in this scope (${stats.flagged_count.toLocaleString()} flagged total).`;
}
