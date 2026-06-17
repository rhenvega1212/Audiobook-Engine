import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { displayBookTitle } from "@/lib/books/display-title";
import { CleanupClient } from "./cleanup-client";

export const dynamic = "force-dynamic";

/** Fast shell — lines/chapters load client-side via /api/books/[id]/cleanup */
export default async function CleanupPage({
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
    .maybeSingle();

  if (!book) notFound();

  return (
    <CleanupClient
      bookId={id}
      bookTitle={displayBookTitle(book.title)}
    />
  );
}
