import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
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

  const { data: lines } = await supabase
    .from("tagged_lines")
    .select(
      "speaker_label, line_text, spoken_text, characters(elevenlabs_voice_name, voice_style)"
    )
    .eq("book_id", id)
    .order("line_order")
    .limit(50);

  return (
    <ExportClient
      bookId={id}
      bookTitle={book.title}
      status={book.status}
      previewLines={(lines ?? []).map((l) => ({
        speaker: l.speaker_label,
        voice:
          (l.characters as { elevenlabs_voice_name?: string } | null)
            ?.elevenlabs_voice_name ?? "—",
        line: resolveSpokenLine(l.line_text, l.spoken_text, dict).slice(0, 100),
      }))}
    />
  );
}
