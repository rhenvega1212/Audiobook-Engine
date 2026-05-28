import type { SupabaseClient } from "@supabase/supabase-js";
import { findCharacterBySpeaker } from "@/lib/characters/resolve-character";
import type { Character } from "@/lib/types/database";
import { updateBookStatus } from "./compute-book-status";

/**
 * Add alias_name as alias of target, relink book lines, remove duplicate character row.
 */
export async function mergeSpeakerAlias(
  admin: SupabaseClient,
  bookId: string,
  aliasName: string,
  targetCharacterId: string
) {
  const { data: book } = await admin
    .from("books")
    .select("series_id")
    .eq("id", bookId)
    .single();

  if (!book) throw new Error("Book not found");

  const { data: target } = await admin
    .from("characters")
    .select("*")
    .eq("id", targetCharacterId)
    .eq("series_id", book.series_id)
    .single();

  if (!target) throw new Error("Target character not found");

  const aliasNorm = aliasName.trim();
  const aliases = new Set(target.aliases ?? []);
  if (
    aliasNorm.toLowerCase() !== target.canonical_name.toLowerCase() &&
    !aliases.has(aliasNorm)
  ) {
    aliases.add(aliasNorm);
    await admin
      .from("characters")
      .update({ aliases: [...aliases] })
      .eq("id", target.id);
  }

  const { data: duplicate } = await admin
    .from("characters")
    .select("id")
    .eq("series_id", book.series_id)
    .eq("canonical_name", aliasNorm)
    .maybeSingle();

  await admin
    .from("tagged_lines")
    .update({
      speaker_label: target.canonical_name,
      speaker_character_id: target.id,
    })
    .eq("book_id", bookId)
    .ilike("speaker_label", aliasNorm);

  if (duplicate && duplicate.id !== target.id) {
    await admin
      .from("book_characters")
      .delete()
      .eq("book_id", bookId)
      .eq("character_id", duplicate.id);
    await admin
      .from("tagged_lines")
      .update({ speaker_character_id: null })
      .eq("speaker_character_id", duplicate.id);
    await admin.from("characters").delete().eq("id", duplicate.id);
  }

  const { data: lineCounts } = await admin
    .from("tagged_lines")
    .select("id")
    .eq("book_id", bookId)
    .eq("speaker_character_id", target.id);

  const count = lineCounts?.length ?? 0;
  await admin.from("book_characters").upsert(
    {
      book_id: bookId,
      character_id: target.id,
      line_count: count,
    },
    { onConflict: "book_id,character_id" }
  );

  const status = await updateBookStatus(admin, bookId);

  return {
    target: target.canonical_name,
    alias: aliasNorm,
    lines_relinked: count,
    status,
  };
}

export function suggestMergeTarget(
  detectedName: string,
  roster: Character[]
): Character | null {
  const exact = findCharacterBySpeaker(detectedName, roster);
  if (exact) return exact;

  const lower = detectedName.toLowerCase();
  for (const c of roster) {
    if (c.canonical_name.toLowerCase().includes(lower)) return c;
    if (lower.includes(c.canonical_name.toLowerCase())) return c;
    for (const a of c.aliases ?? []) {
      if (a.toLowerCase() === lower) return c;
    }
  }
  return null;
}
