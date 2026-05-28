import { createClient } from "@/lib/supabase/server";
import { fetchAllTaggedLines } from "@/lib/supabase/fetch-all";
import { notFound } from "next/navigation";
import { displayBookTitle } from "@/lib/books/display-title";
import { ExportClient } from "./export-client";
import { resolveSpokenLine } from "@/lib/pronunciation/apply";

export default async function ExportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: book } = await supabase
    .from("books")
    .select("id, title, status, series_id")
    .eq("id", id)
    .single();

  if (!book) notFound();

  const { data: dictionary } = await supabase
    .from("pronunciations")
    .select("word, spoken_form")
    .eq("series_id", book.series_id);

  const dict = dictionary ?? [];

  let dbLines: {
    speaker_label: string;
    line_text: string;
    spoken_text: string | null;
    excluded_from_export?: boolean;
    speaker_character_id: string | null;
  }[];

  try {
    dbLines = await fetchAllTaggedLines(
      supabase,
      id,
      "speaker_label, line_text, spoken_text, excluded_from_export, speaker_character_id"
    );
  } catch {
    dbLines = await fetchAllTaggedLines(
      supabase,
      id,
      "speaker_label, line_text, spoken_text, speaker_character_id"
    );
  }

  const { data: characters } = await supabase
    .from("characters")
    .select("id, canonical_name, elevenlabs_voice_name")
    .eq("series_id", book.series_id);

  const roster = characters ?? [];
  const exportable = dbLines.filter((l) => !l.excluded_from_export);
  const excludedCount = dbLines.length - exportable.length;

  return (
    <ExportClient
      bookId={id}
      bookTitle={displayBookTitle(book.title)}
      status={book.status}
      totalLines={dbLines.length}
      exportableLines={exportable.length}
      excludedCount={excludedCount}
      previewLines={exportable.slice(0, 50).map((l) => {
        const char = roster.find((c) => c.id === l.speaker_character_id);
        return {
          speaker: l.speaker_label,
          voice: char?.elevenlabs_voice_name ?? "—",
          line: resolveSpokenLine(l.line_text, l.spoken_text, dict).slice(0, 100),
        };
      })}
    />
  );
}
