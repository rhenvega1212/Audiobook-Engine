import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllTaggedLines } from "@/lib/supabase/fetch-all";
import { requireUser } from "@/lib/api/auth";
import { buildDetectedCharacters } from "@/lib/books/detected-characters";
import { countUnresolvedFlags } from "@/lib/books/flagged-lines";
import type { Character } from "@/lib/types/database";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id } = await params;
  const supabase = await createClient();

  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("*, series(id, name, pen_name_id, pen_names(name))")
    .eq("id", id)
    .single();

  if (bookError) {
    return NextResponse.json({ error: bookError.message }, { status: 404 });
  }

  const { data: roster } = await supabase
    .from("characters")
    .select("*")
    .eq("series_id", book.series_id);

  const lines = await fetchAllTaggedLines(supabase, id, "*");

  const flaggedCount = countUnresolvedFlags(lines);

  const detected_characters = buildDetectedCharacters(
    lines,
    (roster ?? []) as Character[]
  );

  return NextResponse.json({
    book,
    detected_characters,
    flagged_count: flaggedCount,
    line_count: lines.length,
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id } = await params;
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, title, manuscript_path")
    .eq("id", id)
    .maybeSingle();

  if (bookError) {
    return NextResponse.json({ error: bookError.message }, { status: 500 });
  }
  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  if (book.manuscript_path) {
    const { error: storageError } = await admin.storage
      .from("manuscripts")
      .remove([book.manuscript_path]);
    if (storageError) {
      console.warn("Manuscript storage delete failed:", storageError.message);
    }
  }

  const { error: deleteError } = await admin.from("books").delete().eq("id", id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, title: book.title });
}
