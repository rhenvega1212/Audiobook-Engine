import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/api/auth";
import { resolveMatchStatus, type DetectedCharacter } from "@/lib/characters/match-status";
import type { Character } from "@/lib/types/database";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id } = await params;
  const supabase = await createClient();

  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("*, series(id, name, pen_name_id, pen_names(name))")
    .eq("id", id)
    .single();

  if (bookError) {
    return NextResponse.json({ error: bookError.message }, { status: 404 });
  }

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
    const char = bc.characters as Character | null;
    const name = char?.canonical_name ?? "Unknown";
    if (!detectedMap.has(name)) {
      detectedMap.set(name, { count: bc.line_count, samples: [] });
    }
  }

  for (const line of lines ?? []) {
    if (line.speaker_label === "Narrator") continue;
    const entry = detectedMap.get(line.speaker_label) ?? {
      count: 0,
      samples: [],
    };
    entry.count += 1;
    if (
      entry.samples.length < 3 &&
      line.line_text.length > 0 &&
      line.speaker_label !== "UNKNOWN"
    ) {
      entry.samples.push(line.line_text.slice(0, 120));
    }
    detectedMap.set(line.speaker_label, entry);
  }

  const detected_characters: DetectedCharacter[] = [];

  for (const [name, { count, samples }] of detectedMap) {
    const { status, character, suggestedAliasOf } = resolveMatchStatus(
      name,
      (roster ?? []) as Character[]
    );
    detected_characters.push({
      name,
      line_count: count,
      sample_lines: samples,
      match_status: status,
      matched_character_id: character?.id ?? null,
      matched_character_name: character?.canonical_name ?? null,
      suggested_alias_of: suggestedAliasOf,
    });
  }

  detected_characters.sort((a, b) => b.line_count - a.line_count);

  return NextResponse.json({
    book,
    detected_characters,
    flagged_count: flaggedCount,
    line_count: lines?.length ?? 0,
  });
}
