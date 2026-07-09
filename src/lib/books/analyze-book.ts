import { createAdminClient } from "@/lib/supabase/admin";
import { createEngineCharacter } from "@/lib/engine/types";
import {
  detectSpeakerCandidates,
  processManuscriptFromParagraphs,
} from "@/lib/engine/rules-engine";
import { discoverCastWithAI } from "@/lib/books/ai-cast-discovery";
import {
  extractManuscriptBlocks,
  measureManuscriptCoverage,
} from "@/lib/engine/manuscript-extract";
import { isValidNewCharacter } from "@/lib/engine/unknown-speaker";
import { findCharacterBySpeaker } from "@/lib/characters/resolve-character";
import { resolveMatchStatus } from "@/lib/characters/match-status";
import { updateBookStatus } from "@/lib/books/compute-book-status";
import { createManuscriptSnapshot } from "@/lib/books/manuscript-snapshot";
import { runAiReviewForBook } from "@/lib/books/run-ai-review";
import { rebuildAutoBookChapters } from "@/lib/books/book-chapters";
import type { Character } from "@/lib/types/database";

const INSERT_BATCH = 500;
const MIN_WORD_COVERAGE = 0.98;

/**
 * Run AI cast discovery only when the series roster is this sparse (a cold-start
 * new series, including a re-run after a first upload that detected only a few
 * characters). Established series already have a full cast, so we skip it there
 * to avoid unnecessary API spend.
 */
const COLD_START_ROSTER_THRESHOLD = 5;

export async function analyzeBook(bookId: string, options?: { runAiReview?: boolean }) {
  const admin = createAdminClient();

  await admin.from("books").update({ status: "analyzing" }).eq("id", bookId);

  try {
    return await runAnalysis(admin, bookId, options);
  } catch (e) {
    const { count } = await admin
      .from("tagged_lines")
      .select("*", { count: "exact", head: true })
      .eq("book_id", bookId);

    if ((count ?? 0) > 0) {
      await updateBookStatus(admin, bookId);
    } else {
      await admin.from("books").update({ status: "uploaded" }).eq("id", bookId);
    }
    throw e;
  }
}

async function runAnalysis(
  admin: ReturnType<typeof createAdminClient>,
  bookId: string,
  options?: { runAiReview?: boolean }
) {
  const { data: book, error: bookError } = await admin
    .from("books")
    .select("*, series_id")
    .eq("id", bookId)
    .single();

  if (bookError || !book) throw new Error(bookError?.message ?? "Book not found");

  const { data: chars } = await admin
    .from("characters")
    .select("*")
    .eq("series_id", book.series_id);

  if (!book.manuscript_path) throw new Error("No manuscript uploaded");

  const { data: fileData, error: downloadError } = await admin.storage
    .from("manuscripts")
    .download(book.manuscript_path);

  if (downloadError || !fileData) {
    throw new Error(downloadError?.message ?? "Download failed");
  }

  const buffer = Buffer.from(await fileData.arrayBuffer());
  const { paragraphs, blockCount, chapterParagraphNums } =
    await extractManuscriptBlocks(buffer);

  // Two-pass roster building: create missing characters BEFORE attribution so a
  // character's first line resolves to them instead of landing as UNKNOWN. This
  // is the main lever for cutting manual cleanup on a fresh upload.
  const allChars: Character[] = [...((chars ?? []) as Character[])];
  // Track characters created during this analysis so we can guarantee they end
  // up in book_characters (and therefore in the attribution AI's roster) even
  // if the rules pass didn't attribute any lines to them yet.
  const createdCharIds = new Set<string>();

  function alreadyKnown(name: string): boolean {
    if (
      allChars.some(
        (c) => c.canonical_name.toLowerCase() === name.toLowerCase()
      )
    ) {
      return true;
    }
    const match = resolveMatchStatus(name, allChars);
    return !!match.character && match.status !== "new";
  }

  async function createCharacter(
    name: string,
    gender: "male" | "female" | "unknown",
    aliases: string[]
  ): Promise<void> {
    const { data: newChar } = await admin
      .from("characters")
      .insert({
        series_id: book.series_id,
        canonical_name: name,
        gender,
        role: "guest",
        aliases,
      })
      .select("*")
      .single();
    if (newChar) {
      allChars.push(newChar as Character);
      createdCharIds.add((newChar as Character).id);
    }
  }

  // Cold-start cast discovery: on a nearly-empty series the attribution AI has
  // no roster to assign to and defaults everything to UNKNOWN. Ask Claude for
  // the speaking cast up front and create those characters (with gender, which
  // also helps the rules engine's pronoun inference). Gated to sparse rosters
  // so established series aren't re-charged; best-effort.
  const namedExisting = allChars.filter(
    (c) => c.canonical_name.toLowerCase() !== "narrator"
  );
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey && namedExisting.length < COLD_START_ROSTER_THRESHOLD) {
    try {
      const discovered = await discoverCastWithAI(
        paragraphs,
        apiKey,
        allChars.map((c) => c.canonical_name)
      );
      for (const d of discovered) {
        if (!d.canonical_name || alreadyKnown(d.canonical_name)) continue;
        await createCharacter(d.canonical_name, d.gender, d.aliases);
      }
    } catch (e) {
      console.warn("AI cast discovery skipped:", e);
    }
  }

  // Supplement with regex-based detection of `"…," Name said` speaker tags.
  const candidates = detectSpeakerCandidates(paragraphs);
  for (const [name, count] of candidates) {
    if (!isValidNewCharacter(name, count)) continue;
    if (alreadyKnown(name)) continue;
    await createCharacter(name, "unknown", []);
  }

  const roster = allChars.map((c) =>
    createEngineCharacter(c.canonical_name, c.aliases ?? [], c.gender)
  );
  const result = processManuscriptFromParagraphs(paragraphs, roster);

  const coverage = measureManuscriptCoverage(paragraphs, result.lines);
  if (coverage.word_coverage < MIN_WORD_COVERAGE) {
    throw new Error(
      `Import preserved only ${(coverage.word_coverage * 100).toFixed(1)}% of manuscript words (need ${(MIN_WORD_COVERAGE * 100).toFixed(0)}%). ` +
        `Re-check the docx or contact support. Thin blocks: ${coverage.thin_paragraphs.slice(0, 5).join(", ") || "none"}.`
    );
  }

  await admin.from("tagged_lines").delete().eq("book_id", bookId);
  await admin.from("book_characters").delete().eq("book_id", bookId);

  const lineCounts = new Map<string, number>();
  const rows = result.lines.map((line, idx) => {
    let speakerLabel = line.speaker;
    let speakerCharId: string | null = null;

    if (line.speaker === "Narrator") {
      speakerLabel = "Narrator";
      const narrator = findCharacterBySpeaker("Narrator", allChars);
      if (narrator) {
        speakerCharId = narrator.id;
        lineCounts.set(narrator.id, (lineCounts.get(narrator.id) ?? 0) + 1);
      }
    } else if (line.speaker === "UNKNOWN") {
      speakerLabel = "UNKNOWN";
    } else {
      const char = findCharacterBySpeaker(line.speaker, allChars);
      if (char) {
        speakerCharId = char.id;
        speakerLabel = char.canonical_name;
        lineCounts.set(char.id, (lineCounts.get(char.id) ?? 0) + 1);
      }
    }

    let flagReason = line.flag_reason;
    if (
      line.speaker !== "Narrator" &&
      line.speaker !== "UNKNOWN" &&
      !speakerCharId &&
      !flagReason
    ) {
      flagReason = "speaker_not_in_roster";
    }

    return {
      book_id: bookId,
      line_order: idx,
      paragraph_num: line.paragraph_num,
      speaker_character_id: speakerCharId,
      speaker_label: speakerLabel,
      line_text: line.line,
      confidence: line.confidence,
      flag_reason: flagReason,
      ai_reviewed: false,
      human_reviewed: false,
    };
  });

  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const batch = rows.slice(i, i + INSERT_BATCH);
    const { error: insertError } = await admin.from("tagged_lines").insert(batch);
    if (insertError) throw new Error(insertError.message);
  }

  for (const unknown of result.unknown_speakers) {
    const lineCount = result.lines.filter((l) => l.speaker === unknown).length;
    if (!isValidNewCharacter(unknown, lineCount)) continue;

    const match = resolveMatchStatus(unknown, allChars);
    if (match.character && match.status !== "new") {
      lineCounts.set(match.character.id, (lineCounts.get(match.character.id) ?? 0) + lineCount);
      continue;
    }

    const { data: existing } = await admin
      .from("characters")
      .select("id")
      .eq("series_id", book.series_id)
      .eq("canonical_name", unknown)
      .maybeSingle();

    if (!existing) {
      const { data: newChar } = await admin
        .from("characters")
        .insert({
          series_id: book.series_id,
          canonical_name: unknown,
          gender: "unknown",
          role: "guest",
        })
        .select("id")
        .single();

      if (newChar) {
        lineCounts.set(newChar.id, lineCount);
      }
    } else {
      lineCounts.set(existing.id, (lineCounts.get(existing.id) ?? 0) + lineCount);
    }
  }

  // Guarantee every character created this run is linked to the book, even with
  // zero rules-attributed lines, so the attribution AI can assign dialogue to
  // them (its roster is drawn from book_characters).
  for (const id of createdCharIds) {
    if (!lineCounts.has(id)) lineCounts.set(id, 0);
  }

  const bookCharRows = [...lineCounts.entries()].map(([character_id, line_count]) => ({
    book_id: bookId,
    character_id,
    line_count,
  }));

  if (bookCharRows.length > 0) {
    await admin.from("book_characters").insert(bookCharRows);
  }

  let chapterCount = 0;
  try {
    chapterCount = await rebuildAutoBookChapters(admin, bookId, {
      chapterParagraphNums,
    });
  } catch (e) {
    console.warn("Chapter sync skipped:", e);
  }

  const statsPayload = {
    import_word_coverage: coverage.word_coverage,
    import_paragraph_count: blockCount,
    import_line_count: result.total_lines,
    import_chapter_count: chapterCount,
    analyzed_at: new Date().toISOString(),
  };

  const { error: statsError } = await admin
    .from("books")
    .update(statsPayload as Record<string, unknown>)
    .eq("id", bookId);

  if (statsError) {
    console.warn("Could not save import stats (run migration 20250530000001):", statsError.message);
  }

  let status = await updateBookStatus(admin, bookId);

  await createManuscriptSnapshot(admin, bookId, {
    label: "After import",
    source: "after_import",
  });

  let aiReview: Awaited<ReturnType<typeof runAiReviewForBook>> | null = null;
  const shouldRunAi =
    options?.runAiReview === true &&
    !!process.env.ANTHROPIC_API_KEY &&
    result.flagged_count > 0;

  if (shouldRunAi) {
    try {
      let hasMore = true;
      let totalUpdated = 0;
      let totalCleared = 0;
      let scenesProcessed = 0;
      const errors: string[] = [];

      let lastBatch: Awaited<ReturnType<typeof runAiReviewForBook>> | null =
        null;

      while (hasMore) {
        const batch = await runAiReviewForBook(
          admin,
          bookId,
          process.env.ANTHROPIC_API_KEY!,
          { maxScenes: 12 }
        );
        lastBatch = batch;
        totalUpdated += batch.lines_updated;
        totalCleared += batch.lines_cleared;
        scenesProcessed += batch.scenes_processed;
        errors.push(...(batch.errors ?? []));
        hasMore = batch.has_more ?? false;
        if (hasMore && batch.scenes_processed === 0) {
          hasMore = (batch.pending_ai ?? 0) > 0;
          if (!hasMore) break;
        }
      }

      aiReview = {
        lines_updated: totalUpdated,
        lines_cleared: totalCleared,
        scenes_processed: scenesProcessed,
        status: await updateBookStatus(admin, bookId),
        scenes_total: lastBatch?.scenes_total ?? 0,
        api_calls: lastBatch?.api_calls ?? 0,
        has_more: false,
        pending_flagged: lastBatch?.pending_human_review ?? 0,
        pending_ai: lastBatch?.pending_ai ?? 0,
        pending_human_review: lastBatch?.pending_human_review ?? 0,
        lines_skipped_human: lastBatch?.lines_skipped_human ?? 0,
        snapshot_id: lastBatch?.snapshot_id ?? null,
        used_source_paragraphs: lastBatch?.used_source_paragraphs ?? false,
        errors,
      };
      status = aiReview.status;
    } catch (e) {
      console.error("Auto AI review failed:", e);
    }
  }

  return {
    total_lines: result.total_lines,
    flagged_count: result.flagged_count,
    unknown_speakers: result.unknown_speakers,
    word_coverage: coverage.word_coverage,
    paragraph_count: blockCount,
    chapter_count: chapterCount,
    status,
    ai_review: aiReview
      ? {
          lines_updated: aiReview.lines_updated,
          lines_cleared: aiReview.lines_cleared,
          scenes_processed: aiReview.scenes_processed,
        }
      : null,
  };
}
