import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/api/auth";
import { fetchAllTaggedLines } from "@/lib/supabase/fetch-all";
import type { BookChapterRow } from "@/lib/books/book-chapters";
import type { ManuscriptLine } from "@/lib/manuscript/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id } = await params;
  const supabase = await createClient();

  try {
    const [{ data: book }, chaptersResult, dbLines] = await Promise.all([
      supabase.from("books").select("id").eq("id", id).maybeSingle(),
      supabase
        .from("book_chapters")
        .select(
          "id, book_id, sort_order, title, start_line_id, start_line_order, source"
        )
        .eq("book_id", id)
        .order("start_line_order"),
      fetchAllTaggedLines(
        supabase,
        id,
        "id, line_order, paragraph_num, speaker_label, line_text, excluded_from_export"
      ).catch(() =>
        fetchAllTaggedLines(
          supabase,
          id,
          "id, line_order, paragraph_num, line_text, excluded_from_export"
        )
      ),
    ]);

    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const rows = Array.isArray(dbLines) ? dbLines : [];
    const lines: ManuscriptLine[] = rows.map((l) => ({
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

    const chapters =
      chaptersResult.error == null
        ? ((chaptersResult.data ?? []) as BookChapterRow[])
        : [];

    return NextResponse.json({ lines, chapters });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load manuscript";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
