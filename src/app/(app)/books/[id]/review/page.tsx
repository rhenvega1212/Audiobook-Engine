import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { LineReviewClient } from "./line-review-client";

export default async function LineReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: book } = await supabase
    .from("books")
    .select("id, title")
    .eq("id", id)
    .single();

  if (!book) notFound();

  const { data: lines } = await supabase
    .from("tagged_lines")
    .select("*")
    .eq("book_id", id)
    .order("line_order");

  const { data: characters } = await supabase
    .from("characters")
    .select("id, canonical_name, series_id")
    .eq(
      "series_id",
      (
        await supabase.from("books").select("series_id").eq("id", id).single()
      ).data?.series_id ?? ""
    );

  const allLines = lines ?? [];
  const flagged = allLines.filter((l) => l.flag_reason);
  const reviewed = flagged.filter((l) => l.human_reviewed).length;

  return (
    <LineReviewClient
      bookId={id}
      bookTitle={book.title}
      allLines={allLines}
      flaggedLines={flagged}
      characters={characters ?? []}
      initialReviewed={reviewed}
    />
  );
}
