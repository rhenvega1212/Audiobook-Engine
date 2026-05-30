import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllTaggedLines } from "@/lib/supabase/fetch-all";
import { resyncBookChapterPositions } from "@/lib/books/book-chapters";
import { fetchSourceParagraphs } from "@/lib/books/manuscript-source";
import { notFound } from "next/navigation";
import { displayBookTitle } from "@/lib/books/display-title";
import { findCharacterBySpeaker } from "@/lib/characters/resolve-character";
import type { Character } from "@/lib/types/database";
import { ManuscriptStudioClient } from "./manuscript-studio-client";
import type { ManuscriptLine } from "@/lib/manuscript/types";
import type { BookChapterRow } from "@/lib/books/book-chapters";
import {
  buildAttributionTagsByLineId,
  findMissingSpeechTagInserts,
} from "@/lib/manuscript/attribution-tags";

export const dynamic = "force-dynamic";

export default async function ManuscriptStudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ line?: string; speaker?: string; flagged?: string }>;
}) {
  const { id } = await params;
  const {
    line: initialLineId,
    speaker: initialSpeaker,
    flagged,
  } = await searchParams;
  const supabase = await createClient();

  const { data: book } = await supabase
    .from("books")
    .select("id, title, series_id")
    .eq("id", id)
    .maybeSingle();

  if (!book) notFound();

  const [{ data: characters }, { data: dictionary }, chaptersResult] =
    await Promise.all([
      supabase.from("characters").select("*").eq("series_id", book.series_id),
      supabase
        .from("pronunciations")
        .select("word, spoken_form")
        .eq("series_id", book.series_id),
      supabase
        .from("book_chapters")
        .select(
          "id, book_id, sort_order, title, start_line_id, start_line_order, source"
        )
        .eq("book_id", id)
        .order("start_line_order"),
    ]);

  const bookChapters =
    chaptersResult.error == null
      ? ((chaptersResult.data ?? []) as BookChapterRow[])
      : [];

  let syncedChapters = bookChapters;
  if (bookChapters.length > 0) {
    try {
      const admin = createAdminClient();
      syncedChapters = await resyncBookChapterPositions(admin, id);
    } catch (e) {
      console.warn("Chapter position resync skipped:", e);
    }
  }

  const roster = (characters ?? []) as Character[];

  let dbLines: {
    id: string;
    line_order: number;
    paragraph_num: number;
    speaker_label: string;
    line_text: string;
    flag_reason: string | null;
    speaker_character_id: string | null;
    excluded_from_export?: boolean;
  }[];

  try {
    dbLines = await fetchAllTaggedLines(
      supabase,
      id,
      "id, line_order, paragraph_num, speaker_label, line_text, flag_reason, speaker_character_id, excluded_from_export"
    );
  } catch {
    dbLines = await fetchAllTaggedLines(
      supabase,
      id,
      "id, line_order, paragraph_num, speaker_label, line_text, flag_reason, speaker_character_id"
    );
  }

  const lines: ManuscriptLine[] = dbLines.map((l) => {
    const char =
      roster.find((c) => c.id === l.speaker_character_id) ??
      findCharacterBySpeaker(l.speaker_label, roster);
    return {
      id: l.id,
      line_order: l.line_order,
      paragraph_num: l.paragraph_num,
      speaker_label: l.speaker_label,
      speaker_character_id: l.speaker_character_id,
      line_text: l.line_text,
      flag_reason: l.flag_reason,
      excluded_from_export: l.excluded_from_export ?? false,
      voice_id: char?.elevenlabs_voice_id ?? null,
      voice_name: char?.elevenlabs_voice_name ?? null,
    };
  });

  let sourceParagraphs: string[] | undefined;
  let speechTagsByLineId: Record<string, string> = {};
  let missingSpeechTagCount = 0;
  try {
    const admin = createAdminClient();
    sourceParagraphs = (await fetchSourceParagraphs(admin, id)) ?? undefined;
    if (sourceParagraphs?.length) {
      const tagLines = lines.map((l) => ({
        id: l.id,
        line_order: l.line_order,
        paragraph_num: l.paragraph_num,
        line_text: l.line_text,
      }));
      for (const [lineId, tag] of buildAttributionTagsByLineId(
        tagLines,
        sourceParagraphs
      )) {
        speechTagsByLineId[lineId] = tag;
      }
      missingSpeechTagCount = findMissingSpeechTagInserts(
        tagLines,
        sourceParagraphs
      ).length;
    }
  } catch (e) {
    console.warn("Source paragraph load skipped:", e);
  }

  return (
    <ManuscriptStudioClient
      bookId={id}
      bookTitle={displayBookTitle(book.title)}
      initialLines={lines}
      characters={roster}
      dictionary={dictionary ?? []}
      initialLineId={initialLineId}
      initialSpeaker={initialSpeaker}
      initialFlaggedOnly={flagged === "1"}
      initialBookChapters={(syncedChapters ?? []) as BookChapterRow[]}
      speechTagsByLineId={speechTagsByLineId}
      initialMissingSpeechTagCount={missingSpeechTagCount}
    />
  );
}
