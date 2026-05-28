import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/api/auth";
import { z } from "zod";

const createBookCharacterSchema = z.object({
  canonical_name: z.string().min(1).max(200),
  gender: z.enum(["male", "female", "unknown"]).optional(),
  role: z
    .enum(["narrator", "protagonist", "series_regular", "recurring", "guest"])
    .optional(),
});

/** Create a series character and link them to this book. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id: bookId } = await params;
  const body = await request.json();
  const parsed = createBookCharacterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: book } = await supabase
    .from("books")
    .select("series_id")
    .eq("id", bookId)
    .single();

  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const name = parsed.data.canonical_name.trim();
  const { data: existing } = await supabase
    .from("characters")
    .select("id, canonical_name, elevenlabs_voice_id, elevenlabs_voice_name")
    .eq("series_id", book.series_id)
    .ilike("canonical_name", name)
    .maybeSingle();

  let character = existing;

  if (!character) {
    const { data: created, error: insertError } = await supabase
      .from("characters")
      .insert({
        series_id: book.series_id,
        canonical_name: name,
        aliases: [],
        gender: parsed.data.gender ?? "unknown",
        role: parsed.data.role ?? "guest",
      })
      .select("id, canonical_name, elevenlabs_voice_id, elevenlabs_voice_name")
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
    character = created;
  }

  const { error: linkError } = await supabase.from("book_characters").upsert(
    {
      book_id: bookId,
      character_id: character.id,
      line_count: 0,
    },
    { onConflict: "book_id,character_id" }
  );

  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 500 });
  }

  return NextResponse.json(character, { status: existing ? 200 : 201 });
}
