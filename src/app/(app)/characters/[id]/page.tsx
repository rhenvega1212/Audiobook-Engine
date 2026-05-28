import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { enrichLibraryCharacter } from "@/lib/characters/character-library";
import { fetchCharacterById } from "@/lib/supabase/characters-query";
import { CharacterDetailClient } from "./character-detail-client";

export default async function CharacterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const character = await fetchCharacterById(supabase, id);

  if (!character) notFound();

  const { data: history } = await supabase
    .from("casting_history")
    .select("*")
    .eq("character_id", id)
    .order("changed_at", { ascending: false });

  const { data: appearances } = await supabase
    .from("book_characters")
    .select("line_count, books(id, title)")
    .eq("character_id", id);

  const total_lines = (appearances ?? []).reduce(
    (sum, a) => sum + (a.line_count ?? 0),
    0
  );
  const book_count = appearances?.length ?? 0;
  const library = enrichLibraryCharacter(character, { total_lines, book_count });

  const { data: sampleRows } = await supabase
    .from("tagged_lines")
    .select("line_text")
    .eq("speaker_character_id", id)
    .not("line_text", "is", null)
    .limit(5);

  const sampleLines = (sampleRows ?? [])
    .map((r) => r.line_text?.slice(0, 200))
    .filter(Boolean) as string[];

  const { data: seriesCharacters } = await supabase
    .from("characters")
    .select("id, canonical_name, elevenlabs_voice_id")
    .eq("series_id", character.series_id);

  return (
    <div>
      <Link href="/characters" className="text-body-sm text-teal hover:underline">
        ← Character library
      </Link>
      <CharacterDetailClient
        character={character}
        library={library}
        sampleLines={sampleLines}
        seriesCharacters={seriesCharacters ?? []}
        history={history ?? []}
        appearances={(appearances ?? []).map((a) => ({
          title: (a.books as { title?: string })?.title ?? "Unknown",
          line_count: a.line_count,
        }))}
      />
    </div>
  );
}
