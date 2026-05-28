import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/api/auth";
import { fetchAllTaggedLines } from "@/lib/supabase/fetch-all";
import { resolveSpokenLine } from "@/lib/pronunciation/apply";
import { findCharacterBySpeaker } from "@/lib/characters/resolve-character";
import type { Character } from "@/lib/types/database";

function escapeCsv(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id } = await params;
  const force = new URL(request.url).searchParams.get("force") === "1";
  const supabase = await createClient();

  const { data: book } = await supabase
    .from("books")
    .select("series_id, status")
    .eq("id", id)
    .single();

  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const [{ data: chars }, { data: dictionary }] = await Promise.all([
    supabase.from("characters").select("*").eq("series_id", book.series_id),
    supabase
      .from("pronunciations")
      .select("word, spoken_form")
      .eq("series_id", book.series_id),
  ]);

  let lines: { speaker_label: string; line_text: string; spoken_text: string | null }[];
  try {
    lines = await fetchAllTaggedLines(
      supabase,
      id,
      "speaker_label, line_text, spoken_text, excluded_from_export"
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load lines";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { count: flaggedCount } = await supabase
    .from("tagged_lines")
    .select("*", { count: "exact", head: true })
    .eq("book_id", id)
    .not("flag_reason", "is", null);

  const speakersInBook = new Set(
    lines.map((l) => l.speaker_label).filter((s) => s !== "UNKNOWN")
  );
  const uncast: string[] = [];
  for (const speaker of speakersInBook) {
    const char = findCharacterBySpeaker(speaker, (chars ?? []) as Character[]);
    if (char && !char.elevenlabs_voice_id) {
      uncast.push(char.canonical_name);
    } else if (!char && speaker !== "Narrator") {
      uncast.push(speaker);
    }
  }

  const warnings: string[] = [];
  if ((flaggedCount ?? 0) > 0) {
    warnings.push(`${flaggedCount} lines still flagged for review`);
  }
  if (uncast.length > 0) {
    warnings.push(`Uncast speakers: ${[...new Set(uncast)].join(", ")}`);
  }

  if (warnings.length > 0 && !force) {
    return NextResponse.json(
      { error: "Export validation failed", warnings },
      { status: 422 }
    );
  }

  const dict = dictionary ?? [];
  const header = "Speaker,Line";
  const exportable = lines.filter(
    (l) => !(l as { excluded_from_export?: boolean }).excluded_from_export
  );

  const rows = exportable.map((l) => {
    const exportLine = resolveSpokenLine(l.line_text, l.spoken_text, dict);
    return `${escapeCsv(l.speaker_label)},${escapeCsv(exportLine)}`;
  });
  const csv = [header, ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="book-${id}-export.csv"`,
      ...(warnings.length > 0
        ? { "X-Export-Warnings": warnings.join("; ") }
        : {}),
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
