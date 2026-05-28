import { createClient } from "@/lib/supabase/server";
import { fetchAllTaggedLines } from "@/lib/supabase/fetch-all";
import { notFound } from "next/navigation";
import { resolveSpokenLine } from "@/lib/pronunciation/apply";
import { displayBookTitle } from "@/lib/books/display-title";
import { LineReviewClient } from "./line-review-client";

export const dynamic = "force-dynamic";

export default async function LineReviewPage({
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

  const [{ data: characters }, { data: dictionary }] = await Promise.all([
    supabase
      .from("characters")
      .select("id, canonical_name, elevenlabs_voice_id, elevenlabs_voice_name")
      .eq("series_id", book.series_id),
    supabase
      .from("pronunciations")
      .select("word, spoken_form")
      .eq("series_id", book.series_id),
  ]);

  const lines = await fetchAllTaggedLines(supabase, id, "*");
  const dict = dictionary ?? [];
  const flagged = lines.filter((l) => l.flag_reason);
  const reviewed = flagged.filter((l) => l.human_reviewed).length;

  const voiceBySpeaker = Object.fromEntries(
    (characters ?? []).map((c) => [c.canonical_name, c.elevenlabs_voice_id])
  );

  return (
    <LineReviewClient
      bookId={id}
      bookTitle={displayBookTitle(book.title)}
      allLines={lines}
      flaggedLines={flagged}
      characters={characters ?? []}
      voiceBySpeaker={voiceBySpeaker}
      dictionary={dict}
      initialReviewed={reviewed}
    />
  );
}
