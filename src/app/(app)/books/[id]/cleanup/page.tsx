import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllTaggedLines } from "@/lib/supabase/fetch-all";
import { resyncBookChapterPositions } from "@/lib/books/book-chapters";
import { fetchSourceParagraphs } from "@/lib/books/manuscript-source";
import { notFound } from "next/navigation";
import { displayBookTitle } from "@/lib/books/display-title";
import { CleanupClient } from "./cleanup-client";
import type { ManuscriptLine } from "@/lib/manuscript/types";
import type { BookChapterRow } from "@/lib/books/book-chapters";

export const dynamic = "force-dynamic";

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

  const chaptersResult = await supabase
    .from("book_chapters")
    .select(
      "id, book_id, sort_order, title, start_line_id, start_line_order, source"
    )
    .eq("book_id", id)
    .order("start_line_order");

  let bookChapters =
    chaptersResult.error == null
      ? ((chaptersResult.data ?? []) as BookChapterRow[])
      : [];

  // Repair chapter boundaries after prior deletes (line_order renumber drift)
  if (bookChapters.length > 0) {
    try {
      const admin = createAdminClient();
      bookChapters = await resyncBookChapterPositions(admin, id);
    } catch (e) {
      console.warn("Chapter position resync skipped:", e);
    }
  }

  let dbLines: {
    id: string;
    line_order: number;
    paragraph_num: number;
    speaker_label: string;
    line_text: string;
    excluded_from_export?: boolean;
  }[];

  try {
    dbLines = await fetchAllTaggedLines(
      supabase,
      id,
      "id, line_order, paragraph_num, speaker_label, line_text, excluded_from_export"
    );
  } catch {
    dbLines = await fetchAllTaggedLines(
      supabase,
      id,
      "id, line_order, paragraph_num, line_text, excluded_from_export"
    );
  }

  const lines: ManuscriptLine[] = dbLines.map((l) => ({
    id: l.id,
    line_order: l.line_order,
    paragraph_num: l.paragraph_num,
    speaker_label: l.speaker_label ?? "Narrator",
    speaker_character_id: null,
    line_text: l.line_text,
    flag_reason: null,
    excluded_from_export: l.excluded_from_export ?? false,
    voice_id: null,
    voice_name: null,
  }));

  let sourceParagraphs: string[] | undefined;
  try {
    const admin = createAdminClient();
    sourceParagraphs = (await fetchSourceParagraphs(admin, id)) ?? undefined;
  } catch (e) {
    console.warn("Source paragraph load skipped:", e);
  }

  return (
    <CleanupClient
      bookId={id}
      bookTitle={displayBookTitle(book.title)}
      initialLines={lines}
      initialBookChapters={bookChapters}
      sourceParagraphs={sourceParagraphs}
    />
  );
}
