import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllTaggedLines } from "@/lib/supabase/fetch-all";
import { fetchSourceParagraphs } from "@/lib/books/manuscript-source";
import { notFound } from "next/navigation";
import { displayBookTitle } from "@/lib/books/display-title";
import { findCharacterBySpeaker } from "@/lib/characters/resolve-character";
import { voicePlaybackFromCharacter } from "@/lib/elevenlabs/voice-cast";
import type { Character } from "@/lib/types/database";
import { ManuscriptStudioClient } from "./manuscript-studio-client";
import type { ManuscriptLine } from "@/lib/manuscript/types";
import type { BookChapterRow } from "@/lib/books/book-chapters";
import { countUndoSnapshots } from "@/lib/books/manuscript-snapshot";
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

  // Admin client is only needed for the source manuscript (speech tags). Create
  // it once and reuse; fall back gracefully if it can't be created.
  let admin: ReturnType<typeof createAdminClient> | null = null;
  try {
    admin = createAdminClient();
  } catch (e) {
    console.warn("Admin client unavailable for source paragraphs:", e);
  }

  type DbLine = {
    id: string;
    line_order: number;
    paragraph_num: number;
    speaker_label: string;
    line_text: string;
    flag_reason: string | null;
    human_reviewed?: boolean;
    speaker_character_id: string | null;
    excluded_from_export?: boolean;
  };

  // Run every independent read in parallel. Chapter positions are kept in sync
  // by the line-edit operations themselves, so there's no need to resync (and
  // re-fetch every line a second time) on each page load.
  const [
    { data: characters },
    { data: dictionary },
    chaptersResult,
    dbLines,
    loadedSourceParagraphs,
  ] = await Promise.all([
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
    fetchAllTaggedLines<DbLine>(
      supabase,
      id,
      "id, line_order, paragraph_num, speaker_label, line_text, flag_reason, human_reviewed, speaker_character_id, excluded_from_export"
    ).catch(() =>
      fetchAllTaggedLines<DbLine>(
        supabase,
        id,
        "id, line_order, paragraph_num, speaker_label, line_text, flag_reason, human_reviewed, speaker_character_id"
      )
    ),
    admin
      ? fetchSourceParagraphs(admin, id).catch((e) => {
          console.warn("Source paragraph load skipped:", e);
          return null;
        })
      : Promise.resolve(null),
  ]);

  const syncedChapters =
    chaptersResult.error == null
      ? ((chaptersResult.data ?? []) as BookChapterRow[])
      : [];

  const roster = (characters ?? []) as Character[];

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
      human_reviewed: l.human_reviewed ?? false,
      excluded_from_export: l.excluded_from_export ?? false,
      voice_id: char?.elevenlabs_voice_id ?? null,
      voice_name: char?.elevenlabs_voice_name ?? null,
      voice_playback: voicePlaybackFromCharacter(char),
    };
  });

  const sourceParagraphs = loadedSourceParagraphs ?? undefined;
  const speechTagsByLineId: Record<string, string> = {};
  let missingSpeechTagCount = 0;
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

  let initialUndoCount = 0;
  if (admin) {
    try {
      initialUndoCount = await countUndoSnapshots(admin, id);
    } catch {
      initialUndoCount = 0;
    }
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
      initialUndoCount={initialUndoCount}
    />
  );
}
