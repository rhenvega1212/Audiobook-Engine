import type { SupabaseClient } from "@supabase/supabase-js";
import type { Character } from "@/lib/types/database";

const CHARACTER_SELECT = `
  id,
  series_id,
  canonical_name,
  aliases,
  gender,
  role,
  description,
  elevenlabs_voice_id,
  elevenlabs_voice_name,
  voice_style,
  voice_notes,
  created_at,
  updated_at,
  series(id, name, pen_name_id, pen_names(name))
`;

function toCharacter(row: Record<string, unknown>): Character {
  return {
    ...row,
    role: (row.role as Character["role"]) ?? "guest",
  } as Character;
}

/** Fetch all characters for the library (requires migration 006 `role` column). */
export async function fetchCharactersForLibrary(
  client: SupabaseClient
): Promise<Character[]> {
  const { data, error } = await client
    .from("characters")
    .select(CHARACTER_SELECT)
    .order("canonical_name");

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => toCharacter(row as Record<string, unknown>));
}

export async function fetchCharacterById(
  client: SupabaseClient,
  id: string
): Promise<Character | null> {
  const { data, error } = await client
    .from("characters")
    .select(CHARACTER_SELECT)
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return toCharacter(data as Record<string, unknown>);
}
