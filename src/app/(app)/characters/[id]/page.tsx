import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CharacterDetailClient } from "./character-detail-client";

export default async function CharacterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: character } = await supabase
    .from("characters")
    .select("*, series(id, name, pen_names(name))")
    .eq("id", id)
    .single();

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

  return (
    <div>
      <Link href="/characters" className="text-body-sm text-teal hover:underline">
        ← Character library
      </Link>
      <CharacterDetailClient
        character={character}
        history={history ?? []}
        appearances={(appearances ?? []).map((a) => ({
          title: (a.books as { title?: string })?.title ?? "Unknown",
          line_count: a.line_count,
        }))}
      />
    </div>
  );
}
