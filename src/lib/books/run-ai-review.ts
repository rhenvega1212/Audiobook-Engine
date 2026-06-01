import type { SupabaseClient } from "@supabase/supabase-js";
import { CANONICAL_CAST_NAMES } from "@/lib/engine/unknown-speaker";
import { createEngineCharacter } from "@/lib/engine/types";
import { runAiAssistedPass, lineNeedsAiPass } from "@/lib/engine/ai-attribution";
import { fetchAllTaggedLines } from "@/lib/supabase/fetch-all";
import { findCharacterBySpeaker } from "@/lib/characters/resolve-character";
import type { Character } from "@/lib/types/database";
import { updateBookStatus } from "./compute-book-status";
import {
  canRunAiScene,
  ESTIMATED_USD_PER_AI_SCENE,
  budgetSummary,
} from "./ai-budget";
import { fetchSourceParagraphs } from "./manuscript-source";
import {
  createAiReviewSnapshot,
  getLatestAiReviewSnapshot,
} from "./ai-review-snapshot";
import {
  type AiReviewApplyItem,
  type AiReviewProposal,
  flagReasonAfterApply,
  shouldClearFlagAfterApply,
} from "./ai-review-proposals";
import {
  type AiReviewScope,
  eligibleLineIndices,
} from "./ai-review-scope";
import type { BookChapterRow } from "./book-chapters";
import {
  summarizeAiReviewEligibility,
  type AiReviewEligibilityStats,
} from "./ai-review-eligibility";

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

export type RunAiReviewOptions = {
  maxScenes?: number;
  createSnapshot?: boolean;
  includeAiReviewed?: boolean;
  scope?: AiReviewScope;
  chapters?: BookChapterRow[];
  previewOnly?: boolean;
  /** Line indices already handled in a multi-request preview run. */
  processedIndices?: number[];
};

async function loadAiReviewContext(admin: SupabaseClient, bookId: string) {
  const { data: book } = await admin
    .from("books")
    .select("series_id, ai_budget_usd, ai_spend_usd")
    .eq("id", bookId)
    .single();

  if (!book) throw new Error("Book not found");

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
  const sourceParagraphs = await fetchSourceParagraphs(admin, bookId);

  return {
    book,
    chars: (chars ?? []) as Character[],
    roster,
    dbLines,
    sourceParagraphs,
    spendUsd: Number(book.ai_spend_usd ?? 0),
    budgetUsd: Number(book.ai_budget_usd ?? 500),
  };
}

function buildEngineLines(dbLines: Awaited<ReturnType<typeof loadAiReviewContext>>["dbLines"]) {
  return dbLines.map((l) => ({
    speaker: l.speaker_label,
    line: l.line_text,
    paragraph_num: l.paragraph_num,
    confidence: (l.confidence ?? "none") as "high" | "medium" | "low" | "none",
    flag_reason: l.flag_reason,
    ai_reviewed: l.ai_reviewed ?? false,
    human_reviewed: l.human_reviewed ?? false,
  }));
}

export async function previewAiReviewForBook(
  admin: SupabaseClient,
  bookId: string,
  apiKey: string,
  options?: RunAiReviewOptions
) {
  const ctx = await loadAiReviewContext(admin, bookId);
  if (!canRunAiScene(ctx.spendUsd, ctx.budgetUsd, 1)) {
    const summary = budgetSummary(ctx.spendUsd, ctx.budgetUsd);
    return {
      proposals: [] as AiReviewProposal[],
      scenes_total: 0,
      scenes_processed: 0,
      api_calls: 0,
      has_more: false,
      errors: [
        `AI budget reached ($${summary.spend.toFixed(2)} / $${summary.cap.toFixed(2)}).`,
      ],
      budget_exceeded: true,
      budget: summary,
    };
  }

  const scope = options?.scope ?? { type: "flagged" as const };
  const chapters = options?.chapters ?? [];
  const eligibility = summarizeAiReviewEligibility(
    ctx.dbLines,
    scope,
    chapters,
    options?.includeAiReviewed === true
  );
  const eligible = eligibleLineIndices(ctx.dbLines, scope, chapters);
  const previewProcessed = new Set(options?.processedIndices ?? []);

  const engineLines = buildEngineLines(ctx.dbLines);
  const passOptions = {
    previewOnly: true as const,
    includeAiReviewed: options?.includeAiReviewed,
    eligibleIndices: eligible,
    previewProcessed,
    paragraphNums: ctx.dbLines.map((l) => l.paragraph_num),
    sourceParagraphs: ctx.sourceParagraphs ?? undefined,
    lineIds: ctx.dbLines.map((l) => l.id),
    lineOrders: ctx.dbLines.map((l) => l.line_order),
    maxScenes: options?.maxScenes ?? 12,
  };

  const result = await runAiAssistedPass(
    engineLines,
    ctx.roster,
    apiKey,
    passOptions
  );

  for (const idx of result.processed_line_indices) {
    previewProcessed.add(idx);
  }

  const hasMore = engineLines.some((l, i) =>
    lineNeedsAiPass(l, i, { ...passOptions, previewProcessed })
  );

  if (result.api_calls > 0) {
    await admin
      .from("books")
      .update({
        ai_spend_usd:
          ctx.spendUsd + result.api_calls * ESTIMATED_USD_PER_AI_SCENE,
      })
      .eq("id", bookId);
  }

  return {
    proposals: result.proposals,
    scenes_total: result.scenes_total,
    scenes_processed: result.scenes_processed,
    api_calls: result.api_calls,
    has_more: hasMore,
    processed_indices: [...previewProcessed],
    errors: result.errors,
    used_source_paragraphs: !!ctx.sourceParagraphs?.length,
    eligibility,
  };
}

export type { AiReviewEligibilityStats };

export async function applyAiReviewProposals(
  admin: SupabaseClient,
  bookId: string,
  items: AiReviewApplyItem[],
  options?: { createSnapshot?: boolean }
) {
  const accepted = items.filter((i) => i.accept);
  if (accepted.length === 0) {
    return { applied: 0, lines_cleared: 0, status: await updateBookStatus(admin, bookId) };
  }

  let snapshotId: string | null = null;
  if (options?.createSnapshot) {
    const snap = await createAiReviewSnapshot(admin, bookId);
    snapshotId = snap?.id ?? null;
  }

  const { data: chars } = await admin
    .from("characters")
    .select("*")
    .eq(
      "series_id",
      (
        await admin.from("books").select("series_id").eq("id", bookId).single()
      ).data?.series_id ?? ""
    );

  const acceptSet = new Set(accepted.map((a) => a.line_id));
  const { data: dbLines } = await admin
    .from("tagged_lines")
    .select(
      "id, speaker_label, flag_reason, human_reviewed, confidence, ai_reviewed"
    )
    .eq("book_id", bookId)
    .in("id", [...acceptSet]);

  let applied = 0;
  let linesCleared = 0;

  for (const item of accepted) {
    const dbLine = dbLines?.find((l) => l.id === item.line_id);
    if (!dbLine || dbLine.human_reviewed) continue;

    const char = findCharacterBySpeaker(item.speaker, (chars ?? []) as Character[]);
    const hadFlag = !!dbLine.flag_reason;
    const clearFlag = shouldClearFlagAfterApply(
      item.speaker,
      item.confidence,
      hadFlag
    );
    if (clearFlag) linesCleared++;

    const newFlagReason = flagReasonAfterApply(
      dbLine.speaker_label,
      item.speaker,
      dbLine.flag_reason,
      item.confidence,
      clearFlag
    );

    await admin
      .from("tagged_lines")
      .update({
        speaker_label: char?.canonical_name ?? item.speaker,
        speaker_character_id: char?.id ?? null,
        confidence: item.confidence,
        flag_reason: newFlagReason,
        ai_reviewed: true,
      })
      .eq("id", item.line_id);

    applied++;
  }

  const status = await updateBookStatus(admin, bookId);
  return { applied, lines_cleared: linesCleared, status, snapshot_id: snapshotId };
}

/** Direct apply (legacy / upload flow) — skips preview step. */
export async function runAiReviewForBook(
  admin: SupabaseClient,
  bookId: string,
  apiKey: string,
  options?: RunAiReviewOptions
) {
  const ctx = await loadAiReviewContext(admin, bookId);
  if (!canRunAiScene(ctx.spendUsd, ctx.budgetUsd, 1)) {
    const summary = budgetSummary(ctx.spendUsd, ctx.budgetUsd);
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
        `AI budget reached ($${summary.spend.toFixed(2)} / $${summary.cap.toFixed(2)}). Raise the book budget on the book page.`,
      ],
      budget_exceeded: true,
      budget: summary,
    };
  }

  let snapshotId: string | null = null;
  if (options?.createSnapshot) {
    const snap = await createAiReviewSnapshot(admin, bookId);
    snapshotId = snap?.id ?? null;
  }

  const scope = options?.scope ?? { type: "flagged" as const };
  const chapters = options?.chapters ?? [];
  const eligible = eligibleLineIndices(ctx.dbLines, scope, chapters);

  const result = await runAiAssistedPass(
    buildEngineLines(ctx.dbLines),
    ctx.roster,
    apiKey,
    {
      maxScenes: options?.maxScenes,
      includeAiReviewed: options?.includeAiReviewed,
      eligibleIndices: eligible,
      paragraphNums: ctx.dbLines.map((l) => l.paragraph_num),
      sourceParagraphs: ctx.sourceParagraphs ?? undefined,
      lineIds: ctx.dbLines.map((l) => l.id),
      lineOrders: ctx.dbLines.map((l) => l.line_order),
    }
  );

  if (result.api_calls > 0) {
    await admin
      .from("books")
      .update({
        ai_spend_usd: ctx.spendUsd + result.api_calls * ESTIMATED_USD_PER_AI_SCENE,
      })
      .eq("id", bookId);
  }

  let linesCleared = 0;
  let linesSkippedHuman = 0;

  async function applyUpdate(globalIdx: number) {
    const updated = result.lines[globalIdx];
    const dbLine = ctx.dbLines[globalIdx];
    if (!updated || !dbLine) return;

    if (dbLine.human_reviewed) {
      linesSkippedHuman++;
      return;
    }

    const wasFlagged = !!dbLine.flag_reason;
    const wasProcessed = result.processed_line_indices.includes(globalIdx);
    if (!wasProcessed) return;

    const char = findCharacterBySpeaker(updated.speaker, ctx.chars);

    const clearFlag = shouldClearFlagAfterApply(
      updated.speaker,
      updated.confidence ?? "none",
      wasFlagged
    );

    const newFlagReason = flagReasonAfterApply(
      dbLine.speaker_label,
      updated.speaker,
      dbLine.flag_reason,
      updated.confidence ?? "none",
      clearFlag
    );

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

  const [{ count: pendingAi }, { count: pendingHuman }] = await Promise.all([
    admin
      .from("tagged_lines")
      .select("*", { count: "exact", head: true })
      .eq("book_id", bookId)
      .not("flag_reason", "is", null)
      .eq("ai_reviewed", false),
    admin
      .from("tagged_lines")
      .select("*", { count: "exact", head: true })
      .eq("book_id", bookId)
      .not("flag_reason", "is", null),
  ]);

  return {
    scenes_total: result.scenes_total,
    scenes_processed: result.scenes_processed,
    lines_updated: result.lines_updated,
    api_calls: result.api_calls,
    lines_cleared: linesCleared,
    lines_skipped_human: linesSkippedHuman,
    status,
    has_more: result.has_more,
    pending_flagged: pendingHuman ?? 0,
    pending_ai: pendingAi ?? 0,
    pending_human_review: pendingHuman ?? 0,
    errors: result.errors,
    snapshot_id: snapshotId,
    used_source_paragraphs: !!ctx.sourceParagraphs?.length,
  };
}

export { getLatestAiReviewSnapshot };
