import { PageHeader } from "@/components/layout/page-header";
import { createClient } from "@/lib/supabase/server";
import { CharactersTable } from "./characters-table";

export default async function CharactersPage() {
  const supabase = await createClient();

  const [{ data: penNames }, { data: series }, { data: characters }] =
    await Promise.all([
      supabase.from("pen_names").select("*").order("name"),
      supabase.from("series").select("*, pen_names(name)").order("name"),
      supabase
        .from("characters")
        .select("*, series(id, name, pen_names(name))")
        .order("canonical_name"),
    ]);

  return (
    <>
      <PageHeader
        title="Character library"
        description="Global character and voice assignments across all series."
      />
      <CharactersTable
        characters={characters ?? []}
        penNames={penNames ?? []}
        series={series ?? []}
      />
    </>
  );
}
