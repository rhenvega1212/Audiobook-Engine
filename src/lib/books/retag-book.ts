import { createAdminClient } from "@/lib/supabase/admin";
import { createEngineCharacter } from "@/lib/engine/types";
import { processManuscriptFromParagraphs } from "@/lib/engine/rules-engine";
import { measureManuscriptCoverage } from "@/lib/engine/manuscript-extract";
import { isValidNewCharacter } from "@/lib/engine/unknown-speaker";
import { findCharacterBySpeaker } from "@/lib/characters/resolve-character";
import { resolveMatchStatus } from "@/lib/characters/match-status";
import { updateBookStatus } from "@/lib/books/compute-book-status";
import { runAiReviewForBook } from "@/lib/books/run-ai-review";
import { rebuildAutoBookChapters } from "@/lib/books/book-chapters";
import { fetchSourceParagraphs } from "@/lib/books/manuscript-source";
import { fetchAllTaggedLines } from "@/lib/supabase/fetch-all";
import {
  chapterParagraphIndices,
  paragraphsFromLines,
} from "@/lib/manuscript/document-blocks";
import type { Character } from "@/lib/types/database";

const INSERT_BATCH = 500;

/** Re-split & assign speakers from current manuscript text (keeps manual deletions). */
export async function retagBook(
  bookId: string,
  options?: { runAiReview?: boolean }
) {
  const admin = createAdminClient();

  await admin.from("books").update({ status: "analyzing" }).eq("id", bookId);

  try {
    return await runRetag(admin, bookId, options);
  } catch (e) {
    await updateBookStatus(admin, bookId);
    throw e;
  }
}

async function runRetag(
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

  const roster = (chars ?? []).map((c) =>
    createEngineCharacter(c.canonical_name, c.aliases ?? [], c.gender)
  );

  const existingLines = await fetchAllTaggedLines<{
    id: string;
    line_order: number;
    paragraph_num: number;
    line_text: string;
    speaker_label: string;
    excluded_from_export?: boolean;
  }>(
    admin,
    bookId,
    "id, line_order, paragraph_num, line_text, speaker_label, excluded_from_export"
  );

  if (existingLines.length === 0) {
    throw new Error("No manuscript lines to tag. Run import analysis first.");
  }

  const sourceParagraphs = await fetchSourceParagraphs(admin, bookId);
  const paragraphs = paragraphsFromLines(
    existingLines,
    sourceParagraphs ?? undefined
  );
  if (paragraphs.length === 0) {
    throw new Error("Manuscript has no text left after cleanup.");
  }

  const chapterParagraphNums = chapterParagraphIndices(paragraphs);
  const result = processManuscriptFromParagraphs(paragraphs, roster);
  const coverage = measureManuscriptCoverage(paragraphs, result.lines);

  await admin.from("tagged_lines").delete().eq("book_id", bookId);
  await admin.from("book_characters").delete().eq("book_id", bookId);

  const lineCounts = new Map<string, number>();
  const rows = result.lines.map((line, idx) => {
    let speakerLabel = line.speaker;
    let speakerCharId: string | null = null;

    if (line.speaker === "Narrator") {
      speakerLabel = "Narrator";
      const narrator = findCharacterBySpeaker("Narrator", (chars ?? []) as Character[]);
      if (narrator) {
        speakerCharId = narrator.id;
        lineCounts.set(narrator.id, (lineCounts.get(narrator.id) ?? 0) + 1);
      }
    } else if (line.speaker === "UNKNOWN") {
      speakerLabel = "UNKNOWN";
    } else {
      const char = findCharacterBySpeaker(line.speaker, (chars ?? []) as Character[]);
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

    const match = resolveMatchStatus(unknown, (chars ?? []) as Character[]);
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

  await admin
    .from("books")
    .update({
      import_word_coverage: coverage.word_coverage,
      import_paragraph_count: paragraphs.length,
      import_line_count: result.total_lines,
      import_chapter_count: chapterCount,
      analyzed_at: new Date().toISOString(),
    } as Record<string, unknown>)
    .eq("id", bookId);

  let status = await updateBookStatus(admin, bookId);

  let aiReview: Awaited<ReturnType<typeof runAiReviewForBook>> | null = null;
  if (
    options?.runAiReview === true &&
    !!process.env.ANTHROPIC_API_KEY &&
    result.flagged_count > 0
  ) {
    try {
      const batch = await runAiReviewForBook(
        admin,
        bookId,
        process.env.ANTHROPIC_API_KEY!,
        { maxScenes: 12 }
      );
      aiReview = batch;
      status = await updateBookStatus(admin, bookId);
    } catch (e) {
      console.error("AI review after retag failed:", e);
    }
  }

  return {
    total_lines: result.total_lines,
    flagged_count: result.flagged_count,
    paragraph_count: paragraphs.length,
    chapter_count: chapterCount,
    word_coverage: coverage.word_coverage,
    status,
    ai_review: aiReview
      ? {
          lines_updated: aiReview.lines_updated,
          lines_cleared: aiReview.lines_cleared,
        }
      : null,
  };
}
