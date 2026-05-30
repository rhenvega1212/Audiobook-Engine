import { createClient } from "@/lib/supabase/server";
import { fetchAllTaggedLines } from "@/lib/supabase/fetch-all";
import { BookDetailClient } from "./book-detail-client";
import { notFound } from "next/navigation";
import type { TaggedLine } from "@/lib/types/database";

export const dynamic = "force-dynamic";

function embedCharacter(
  raw: { canonical_name?: string } | { canonical_name?: string }[] | null
): { canonical_name?: string } | null {
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] ?? null : raw;
}

export default async function BookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("*, series(id, name, pen_name_id, pen_names(name))")
    .eq("id", id)
    .maybeSingle();

  if (bookError) {
    console.error("Book detail load failed:", bookError.message, { id });
    throw new Error(bookError.message);
  }

  if (!book) notFound();

  const [{ data: roster }, { data: bookChars }] = await Promise.all([
    supabase.from("characters").select("*").eq("series_id", book.series_id),
    supabase
      .from("book_characters")
      .select("*, characters(canonical_name)")
      .eq("book_id", id),
  ]);

  let lines: TaggedLine[] = [];
  try {
    lines = await fetchAllTaggedLines(supabase, id, "*");
  } catch (e) {
    console.error("Failed to load tagged lines:", e);
  }

  const flaggedCount = lines.filter((l) => l.flag_reason).length;

  const { count: chapterCount } = await supabase
    .from("book_chapters")
    .select("*", { count: "exact", head: true })
    .eq("book_id", id);

  const detectedMap = new Map<string, { count: number; samples: string[] }>();

  for (const bc of bookChars ?? []) {
    const char = embedCharacter(
      bc.characters as
        | { canonical_name?: string }
        | { canonical_name?: string }[]
        | null
    );
    const name = char?.canonical_name ?? "Unknown";
    detectedMap.set(name, { count: bc.line_count, samples: [] });
  }

  for (const line of lines) {
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
        voice_name: character?.elevenlabs_voice_name ?? null,
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
      lineCount={lines.length}
      chapterCount={chapterCount ?? 0}
    />
  );
}
