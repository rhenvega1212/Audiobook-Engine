import { createClient } from "@/lib/supabase/server";
import { fetchAllTaggedLines } from "@/lib/supabase/fetch-all";
import { notFound } from "next/navigation";
import { resolveSpokenLine } from "@/lib/pronunciation/apply";
import { findCharacterBySpeaker } from "@/lib/characters/resolve-character";
import { voiceCastFromCharacter } from "@/lib/elevenlabs/voice-cast";
import { displayBookTitle } from "@/lib/books/display-title";
import type { BookChapterRow } from "@/lib/books/book-chapters";
import type { Character } from "@/lib/types/database";
import type { RenderChapter, RenderLine } from "@/lib/audio/render-audiobook";
import { DownloadsClient } from "./downloads-client";

export const dynamic = "force-dynamic";

export default async function DownloadsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: book } = await supabase
    .from("books")
    .select("id, title, series_id")
    .eq("id", id)
    .maybeSingle();

  if (!book) notFound();

  const [{ data: characters }, { data: dictionary }, { data: chapterRows }] =
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

  const roster = (characters ?? []) as Character[];
  const dict = dictionary ?? [];

  let dbLines: {
    id: string;
    line_order: number;
    speaker_label: string;
    line_text: string;
    spoken_text: string | null;
    speaker_character_id: string | null;
    excluded_from_export?: boolean;
  }[];
  try {
    dbLines = await fetchAllTaggedLines(
      supabase,
      id,
      "id, line_order, speaker_label, line_text, spoken_text, speaker_character_id, excluded_from_export"
    );
  } catch {
    dbLines = await fetchAllTaggedLines(
      supabase,
      id,
      "id, line_order, speaker_label, line_text, spoken_text, speaker_character_id"
    );
  }

  const audible = dbLines.filter((l) => !l.excluded_from_export);

  const lines: RenderLine[] = audible.map((l) => {
    const char =
      roster.find((c) => c.id === l.speaker_character_id) ??
      findCharacterBySpeaker(l.speaker_label, roster);
    const cast = char ? voiceCastFromCharacter(char) : null;
    return {
      id: l.id,
      line_order: l.line_order,
      speaker_label: l.speaker_label,
      spoken_text: resolveSpokenLine(l.line_text, l.spoken_text, dict),
      voice_id: cast?.voice_id ?? null,
      language_code: cast?.language_code ?? null,
      voice_settings: cast?.voice_settings ?? null,
    };
  });

  const chapters: RenderChapter[] = (
    (chapterRows ?? []) as BookChapterRow[]
  ).map((c) => ({ title: c.title, start_line_order: c.start_line_order }));

  return (
    <DownloadsClient
      bookId={id}
      bookTitle={displayBookTitle(book.title)}
      lines={lines}
      chapters={chapters}
    />
  );
}
