import { createClient } from "@/lib/supabase/server";
import { BookDetailClient } from "./book-detail-client";
import { notFound } from "next/navigation";

export default async function BookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: book } = await supabase
    .from("books")
    .select("*, series(id, name, pen_name_id, pen_names(name))")
    .eq("id", id)
    .single();

  if (!book) notFound();

  const { data: roster } = await supabase
    .from("characters")
    .select("*")
    .eq("series_id", book.series_id);

  const { data: bookChars } = await supabase
    .from("book_characters")
    .select("*, characters(*)")
    .eq("book_id", id);

  const { data: lines } = await supabase
    .from("tagged_lines")
    .select("*")
    .eq("book_id", id)
    .order("line_order");

  const flaggedCount = (lines ?? []).filter((l) => l.flag_reason).length;

  const detectedMap = new Map<string, { count: number; samples: string[] }>();

  for (const bc of bookChars ?? []) {
    const char = bc.characters as { canonical_name?: string } | null;
    const name = char?.canonical_name ?? "Unknown";
    detectedMap.set(name, { count: bc.line_count, samples: [] });
  }

  for (const line of lines ?? []) {
    if (line.speaker_label === "Narrator") continue;
    const entry = detectedMap.get(line.speaker_label) ?? {
      count: 0,
      samples: [],
    };
    entry.count += 1;
    if (entry.samples.length < 3 && line.line_text) {
      entry.samples.push(line.line_text.slice(0, 120));
    }
    detectedMap.set(line.speaker_label, entry);
  }

  const { resolveMatchStatus } = await import("@/lib/characters/match-status");
  const detected_characters = [...detectedMap.entries()].map(
    ([name, { count, samples }]) => {
      const { status, character, suggestedAliasOf } = resolveMatchStatus(
        name,
        roster ?? []
      );
      return {
        name,
        line_count: count,
        sample_lines: samples,
        match_status: status,
        matched_character_id: character?.id ?? null,
        matched_character_name: character?.canonical_name ?? null,
        suggested_alias_of: suggestedAliasOf,
      };
    }
  );

  detected_characters.sort((a, b) => b.line_count - a.line_count);

  return (
    <BookDetailClient
      bookId={id}
      book={book}
      detectedCharacters={detected_characters}
      flaggedCount={flaggedCount}
      roster={roster ?? []}
    />
  );
}
