import { createClient } from "@/lib/supabase/server";
import { fetchAllTaggedLines } from "@/lib/supabase/fetch-all";
import { buildDetectedCharacters } from "@/lib/books/detected-characters";
import { countUnresolvedFlags } from "@/lib/books/flagged-lines";
import { BookDetailClient } from "./book-detail-client";
import { notFound } from "next/navigation";
import type { Character, TaggedLine } from "@/lib/types/database";
import type { BookChapterRow } from "@/lib/books/book-chapters";

export const dynamic = "force-dynamic";

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

  const [{ data: roster }, chaptersResult] = await Promise.all([
    supabase.from("characters").select("*").eq("series_id", book.series_id),
    supabase
      .from("book_chapters")
      .select(
        "id, book_id, sort_order, title, start_line_id, start_line_order, source"
      )
      .eq("book_id", id)
      .order("start_line_order"),
  ]);

  const bookChapters =
    chaptersResult.error == null
      ? ((chaptersResult.data ?? []) as BookChapterRow[])
      : [];

  let lines: TaggedLine[] = [];
  try {
    lines = await fetchAllTaggedLines(supabase, id, "*");
  } catch (e) {
    console.error("Failed to load tagged lines:", e);
  }

  const flaggedCount = countUnresolvedFlags(lines);

  const { count: chapterCount } = await supabase
    .from("book_chapters")
    .select("*", { count: "exact", head: true })
    .eq("book_id", id);

  const detected_characters = buildDetectedCharacters(
    lines,
    (roster ?? []) as Character[]
  );

  return (
    <BookDetailClient
      bookId={id}
      book={book}
      detectedCharacters={detected_characters}
      flaggedCount={flaggedCount}
      roster={roster ?? []}
      lineCount={lines.length}
      chapterCount={chapterCount ?? 0}
      bookChapters={bookChapters}
    />
  );
}
