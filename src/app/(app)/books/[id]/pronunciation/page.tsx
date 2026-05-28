import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAllTaggedLines } from "@/lib/supabase/fetch-all";
import { displayBookTitle } from "@/lib/books/display-title";
import { PronunciationProofreadClient } from "./pronunciation-proofread-client";
import { applyPronunciations } from "@/lib/pronunciation/apply";
import { findCharacterBySpeaker } from "@/lib/characters/resolve-character";
import type { Character } from "@/lib/types/database";

export const dynamic = "force-dynamic";

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

  const [{ data: dictionary }, { data: characters }] = await Promise.all([
    supabase
      .from("pronunciations")
      .select("word, spoken_form")
      .eq("series_id", book.series_id),
    supabase.from("characters").select("*").eq("series_id", book.series_id),
  ]);

  const roster = (characters ?? []) as Character[];

  const lines = await fetchAllTaggedLines<{
    id: string;
    line_order: number;
    speaker_label: string;
    line_text: string;
    spoken_text: string | null;
  }>(
    supabase,
    id,
    "id, line_order, speaker_label, line_text, spoken_text"
  );

  const dict = dictionary ?? [];

  const lineRows = lines.map((l) => {
    const autoExport = applyPronunciations(l.line_text, dict);
    const finalExport = l.spoken_text?.trim()
      ? applyPronunciations(l.spoken_text, dict)
      : autoExport;
    const hasDictionaryHit = autoExport !== l.line_text;
    const hasOverride = !!l.spoken_text?.trim();
    const char = findCharacterBySpeaker(l.speaker_label, roster);
    return {
      id: l.id,
      line_order: l.line_order,
      speaker_label: l.speaker_label,
      line_text: l.line_text,
      spoken_text: l.spoken_text ?? "",
      export_preview: finalExport,
      has_dictionary_hit: hasDictionaryHit,
      has_override: hasOverride,
      voice_id: char?.elevenlabs_voice_id ?? null,
      voice_name: char?.elevenlabs_voice_name ?? null,
    };
  });

  return (
    <PronunciationProofreadClient
      bookId={id}
      bookTitle={displayBookTitle(book.title)}
      seriesId={book.series_id}
      lines={lineRows}
      dictionary={dict}
      dictionaryCount={dict.length}
    />
  );
}
