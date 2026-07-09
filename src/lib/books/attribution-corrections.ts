import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A single human correction to a line's speaker, captured at edit time — before
 * the wrong guess is overwritten. Feeds the per-series correction memory used
 * for AI few-shot examples, alias/gender learning, and the accuracy benchmark.
 */
export type CorrectionInput = {
  lineId: string;
  lineOrder: number | null;
  paragraphNum: number | null;
  lineText: string;
  oldSpeaker: string | null;
  newSpeaker: string;
  oldCharacterId?: string | null;
  newCharacterId?: string | null;
  wasAiReviewed?: boolean;
  priorConfidence?: string | null;
  priorFlagReason?: string | null;
};

/**
 * Only speaker *changes* to a real character teach us anything. Skip no-ops and
 * corrections to UNKNOWN (a human giving up isn't a positive example).
 */
function isTeachingCorrection(c: CorrectionInput): boolean {
  const oldSpeaker = (c.oldSpeaker ?? "").trim();
  const newSpeaker = c.newSpeaker.trim();
  if (!newSpeaker) return false;
  if (newSpeaker.toUpperCase() === "UNKNOWN") return false;
  return oldSpeaker !== newSpeaker;
}

/**
 * Persist human corrections. Best-effort: never blocks or fails the edit — if
 * the table isn't migrated yet or the insert errors, we log and move on.
 */
export async function recordAttributionCorrections(
  admin: SupabaseClient,
  bookId: string,
  corrections: CorrectionInput[]
): Promise<void> {
  try {
    const teaching = corrections.filter(isTeachingCorrection);
    if (teaching.length === 0) return;

    const { data: book } = await admin
      .from("books")
      .select("series_id")
      .eq("id", bookId)
      .maybeSingle();
    const seriesId = (book as { series_id?: string } | null)?.series_id ?? null;

    // Pull the immediate neighbors in one query so each example carries the
    // surrounding dialogue context (attribution is almost always contextual).
    const neededOrders = new Set<number>();
    for (const c of teaching) {
      if (c.lineOrder == null) continue;
      neededOrders.add(c.lineOrder - 1);
      neededOrders.add(c.lineOrder + 1);
    }

    const neighborByOrder = new Map<number, string>();
    if (neededOrders.size > 0) {
      const { data: neighbors } = await admin
        .from("tagged_lines")
        .select("line_order, speaker_label, line_text")
        .eq("book_id", bookId)
        .in("line_order", [...neededOrders]);
      for (const n of (neighbors ?? []) as {
        line_order: number;
        speaker_label: string;
        line_text: string;
      }[]) {
        neighborByOrder.set(n.line_order, `[${n.speaker_label}] ${n.line_text}`);
      }
    }

    const rows = teaching.map((c) => ({
      series_id: seriesId,
      book_id: bookId,
      line_id: c.lineId,
      line_order: c.lineOrder,
      paragraph_num: c.paragraphNum,
      line_text: c.lineText,
      context_before:
        c.lineOrder != null
          ? (neighborByOrder.get(c.lineOrder - 1) ?? null)
          : null,
      context_after:
        c.lineOrder != null
          ? (neighborByOrder.get(c.lineOrder + 1) ?? null)
          : null,
      source_paragraph: null,
      wrong_speaker: c.oldSpeaker ?? null,
      correct_speaker: c.newSpeaker,
      wrong_character_id: c.oldCharacterId ?? null,
      correct_character_id: c.newCharacterId ?? null,
      was_ai_reviewed: c.wasAiReviewed ?? false,
      prior_confidence: c.priorConfidence ?? null,
      prior_flag_reason: c.priorFlagReason ?? null,
      correction_type: null,
    }));

    const { error } = await admin
      .from("attribution_corrections")
      .insert(rows as never);
    if (error) {
      console.warn(
        "attribution_corrections insert skipped (run migration 20250709000000?):",
        error.message
      );
    }
  } catch (e) {
    console.warn("recordAttributionCorrections failed:", e);
  }
}
