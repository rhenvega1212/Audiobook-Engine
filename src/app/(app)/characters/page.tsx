import { PageHeader } from "@/components/layout/page-header";
import { createClient } from "@/lib/supabase/server";
import { fetchCharactersForLibrary } from "@/lib/supabase/characters-query";
import { shouldShowInCharacterLibrary } from "@/lib/characters/library-filter";
import {
  aggregateBookCharacterStats,
  enrichLibraryCharacter,
} from "@/lib/characters/character-library";
import { CharactersTable } from "./characters-table";

export default async function CharactersPage() {
  const supabase = await createClient();

  const [{ data: penNames }, { data: series }, characters, { data: bookChars }] =
    await Promise.all([
      supabase.from("pen_names").select("*").order("name"),
      supabase.from("series").select("*, pen_names(name)").order("name"),
      fetchCharactersForLibrary(supabase),
      supabase.from("book_characters").select("character_id, line_count, book_id"),
    ]);

  const statsByCharacter = aggregateBookCharacterStats(bookChars ?? []);

  const roster = characters
    .filter(shouldShowInCharacterLibrary)
    .map((c) => {
      const stats = statsByCharacter.get(c.id) ?? {
        total_lines: 0,
        book_count: 0,
      };
      return enrichLibraryCharacter(c, stats);
    });

  return (
    <>
      <PageHeader
        title="Character library"
        description="Global character and voice assignments across all series."
      />
      <CharactersTable
        characters={roster}
        penNames={penNames ?? []}
        series={series ?? []}
      />
    </>
  );
}
