import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/api/auth";
import { resolveSpokenLine } from "@/lib/pronunciation/apply";

function escapeCsv(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id } = await params;
  const supabase = await createClient();

  const { data: book } = await supabase
    .from("books")
    .select("series_id")
    .eq("id", id)
    .single();

  const { data: dictionary } = book
    ? await supabase
        .from("pronunciations")
        .select("word, spoken_form")
        .eq("series_id", book.series_id)
    : { data: [] };

  const { data: lines, error: dbError } = await supabase
    .from("tagged_lines")
    .select("speaker_label, line_text, spoken_text")
    .eq("book_id", id)
    .order("line_order");

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  const dict = dictionary ?? [];

  const header = "Speaker,Line";
  const rows = (lines ?? []).map((l) => {
    const exportLine = resolveSpokenLine(l.line_text, l.spoken_text, dict);
    return `${escapeCsv(l.speaker_label)},${escapeCsv(exportLine)}`;
  });
  const csv = [header, ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="book-${id}-export.csv"`,
    },
  });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id } = await params;
  const supabase = await createClient();

  await supabase
    .from("books")
    .update({ status: "exported" })
    .eq("id", id);

  return NextResponse.json({ success: true });
}
