import { createClient } from "@/lib/supabase/server";
import { fetchAllTaggedLines } from "@/lib/supabase/fetch-all";
import { notFound } from "next/navigation";
import { resolveSpokenLine } from "@/lib/pronunciation/apply";
import { findCharacterBySpeaker } from "@/lib/characters/resolve-character";
import type { Character } from "@/lib/types/database";
import { displayBookTitle } from "@/lib/books/display-title";
import { ListenClient } from "./listen-client";

export const dynamic = "force-dynamic";

export default async function ListenPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ speaker?: string; line?: string }>;
}) {
  const { id } = await params;
  const { speaker: initialSpeaker, line: initialLineId } = await searchParams;
  const supabase = await createClient();

  const { data: book } = await supabase
    .from("books")
    .select("id, title, series_id")
    .eq("id", id)
    .maybeSingle();

  if (!book) notFound();

  const [{ data: characters }, { data: dictionary }] = await Promise.all([
    supabase.from("characters").select("*").eq("series_id", book.series_id),
    supabase
      .from("pronunciations")
      .select("word, spoken_form")
      .eq("series_id", book.series_id),
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

  const excludedCount = dbLines.filter((l) => l.excluded_from_export).length;

  const lines = dbLines.map((l) => {
    const char =
      roster.find((c) => c.id === l.speaker_character_id) ??
      findCharacterBySpeaker(l.speaker_label, roster);
    return {
      id: l.id,
      line_order: l.line_order,
      speaker_label: l.speaker_label,
      line_text: l.line_text,
      spoken_text: resolveSpokenLine(l.line_text, l.spoken_text, dict),
      voice_id: char?.elevenlabs_voice_id ?? null,
      voice_name: char?.elevenlabs_voice_name ?? null,
      excluded_from_export: l.excluded_from_export ?? false,
    };
  });

  const speakers = [...new Set(lines.map((l) => l.speaker_label))].sort();
  const castCount = lines.filter((l) => l.voice_id).length;

  return (
    <ListenClient
      bookId={id}
      bookTitle={displayBookTitle(book.title)}
      lines={lines}
      speakers={speakers}
      castCount={castCount}
      totalCount={lines.length}
      excludedCount={excludedCount}
      initialSpeaker={initialSpeaker}
      initialLineId={initialLineId}
    />
  );
}
