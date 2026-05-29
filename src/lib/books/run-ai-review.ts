import type { SupabaseClient } from "@supabase/supabase-js";
import { CANONICAL_CAST_NAMES } from "@/lib/engine/unknown-speaker";
import { createEngineCharacter } from "@/lib/engine/types";
import { runAiAssistedPass } from "@/lib/engine/ai-attribution";
import { fetchAllTaggedLines } from "@/lib/supabase/fetch-all";
import { findCharacterBySpeaker } from "@/lib/characters/resolve-character";
import type { Character } from "@/lib/types/database";
import { updateBookStatus } from "./compute-book-status";
import {
  canRunAiScene,
  ESTIMATED_USD_PER_AI_SCENE,
  budgetSummary,
} from "./ai-budget";

function rosterForBook(
  allChars: Character[],
  characterIdsInBook: Set<string>
): ReturnType<typeof createEngineCharacter>[] {
  return allChars
    .filter(
      (c) =>
        characterIdsInBook.has(c.id) ||
        CANONICAL_CAST_NAMES.has(c.canonical_name)
    )
    .map((c) =>
      createEngineCharacter(c.canonical_name, c.aliases ?? [], c.gender)
    );
}

function shouldClearFlag(
  speaker: string,
  confidence: string,
  hadFlag: boolean
): boolean {
  if (!hadFlag) return false;
  if (speaker === "UNKNOWN") return false;
  return confidence === "high" || confidence === "medium";
}

export async function runAiReviewForBook(
  admin: SupabaseClient,
  bookId: string,
  apiKey: string,
  options?: { maxScenes?: number }
) {
  const { data: book } = await admin
    .from("books")
    .select("series_id, ai_budget_usd, ai_spend_usd")
    .eq("id", bookId)
    .single();

  if (!book) throw new Error("Book not found");

  const budgetUsd = Number(book.ai_budget_usd ?? 500);
  const spendUsd = Number(book.ai_spend_usd ?? 0);
  if (!canRunAiScene(spendUsd, budgetUsd, 1)) {
    const summary = budgetSummary(spendUsd, budgetUsd);
    return {
      scenes_total: 0,
      scenes_processed: 0,
      lines_updated: 0,
      api_calls: 0,
      lines_cleared: 0,
      status: await updateBookStatus(admin, bookId),
      has_more: false,
      pending_flagged: 0,
      errors: [
        `AI budget reached ($${summary.spend.toFixed(2)} / $${summary.cap.toFixed(2)}). Raise the book budget or add Anthropic credits.`,
      ],
      budget_exceeded: true,
      budget: summary,
    };
  }

  const { data: chars } = await admin
    .from("characters")
    .select("*")
    .eq("series_id", book.series_id);

  const { data: bookChars } = await admin
    .from("book_characters")
    .select("character_id")
    .eq("book_id", bookId);

  const idsInBook = new Set((bookChars ?? []).map((bc) => bc.character_id));
  const roster = rosterForBook((chars ?? []) as Character[], idsInBook);

  const dbLines = await fetchAllTaggedLines(admin, bookId, "*");

  const engineLines = dbLines.map((l) => ({
    speaker: l.speaker_label,
    line: l.line_text,
    paragraph_num: l.paragraph_num,
    confidence: (l.confidence ?? "none") as "high" | "medium" | "low" | "none",
    flag_reason: l.flag_reason,
    ai_reviewed: l.ai_reviewed ?? false,
  }));

  const result = await runAiAssistedPass(
    engineLines,
    roster,
    apiKey,
    options
  );

  if (result.api_calls > 0) {
    const added = result.api_calls * ESTIMATED_USD_PER_AI_SCENE;
    await admin
      .from("books")
      .update({ ai_spend_usd: spendUsd + added })
      .eq("id", bookId);
  }

  const processedSet = new Set(result.processed_line_indices);
  let linesCleared = 0;

  async function applyUpdate(globalIdx: number) {
    const updated = result.lines[globalIdx];
    const dbLine = dbLines[globalIdx];
    if (!updated || !dbLine?.flag_reason) return;

    const char = findCharacterBySpeaker(
      updated.speaker,
      (chars ?? []) as Character[]
    );

    const clearFlag = shouldClearFlag(
      updated.speaker,
      updated.confidence ?? "none",
      !!dbLine.flag_reason
    );

    const newFlagReason = clearFlag
      ? null
      : updated.speaker !== dbLine.speaker_label
        ? `ai_reviewed (was: ${dbLine.flag_reason}; changed: ${dbLine.speaker_label} → ${updated.speaker})`
        : `ai_confirmed (was: ${dbLine.flag_reason})`;

    if (clearFlag) linesCleared++;

    await admin
      .from("tagged_lines")
      .update({
        speaker_label: char?.canonical_name ?? updated.speaker,
        speaker_character_id: char?.id ?? null,
        confidence: updated.confidence,
        flag_reason: newFlagReason,
        ai_reviewed: true,
      })
      .eq("id", dbLine.id);
  }

  const BATCH = 25;
  for (let i = 0; i < result.processed_line_indices.length; i += BATCH) {
    const chunk = result.processed_line_indices.slice(i, i + BATCH);
    await Promise.all(chunk.map((idx) => applyUpdate(idx)));
  }

  const status = await updateBookStatus(admin, bookId);

  return {
    scenes_total: result.scenes_total,
    scenes_processed: result.scenes_processed,
    lines_updated: result.lines_updated,
    api_calls: result.api_calls,
    lines_cleared: linesCleared,
    status,
    has_more: result.has_more,
    pending_flagged: dbLines.filter(
      (l, i) => l.flag_reason && !processedSet.has(i)
    ).length,
    errors: result.errors,
  };
}
