import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PronunciationProofreadClient } from "./pronunciation-proofread-client";
import { applyPronunciations } from "@/lib/pronunciation/apply";

export default async function PronunciationPage({
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
    .single();

  if (!book) notFound();

  const [{ data: lines }, { data: dictionary }] = await Promise.all([
    supabase
      .from("tagged_lines")
      .select("id, line_order, speaker_label, line_text, spoken_text")
      .eq("book_id", id)
      .order("line_order"),
    supabase
      .from("pronunciations")
      .select("word, spoken_form")
      .eq("series_id", book.series_id),
  ]);

  const dict = dictionary ?? [];

  const lineRows = (lines ?? []).map((l) => {
    const autoExport = applyPronunciations(l.line_text, dict);
    const finalExport = l.spoken_text?.trim()
      ? applyPronunciations(l.spoken_text, dict)
      : autoExport;
    const hasDictionaryHit = autoExport !== l.line_text;
    const hasOverride = !!l.spoken_text?.trim();
    return {
      id: l.id,
      line_order: l.line_order,
      speaker_label: l.speaker_label,
      line_text: l.line_text,
      spoken_text: l.spoken_text ?? "",
      export_preview: finalExport,
      has_dictionary_hit: hasDictionaryHit,
      has_override: hasOverride,
    };
  });

  return (
    <PronunciationProofreadClient
      bookId={id}
      bookTitle={book.title}
      seriesId={book.series_id}
      lines={lineRows}
      dictionary={dict}
      dictionaryCount={dict.length}
    />
  );
}
