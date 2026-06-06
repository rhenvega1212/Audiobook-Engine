import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/api/auth";
import { formatAccentLabel } from "@/lib/elevenlabs/voice-accents";
import type { Character } from "@/lib/types/database";
import type { VoiceSettings } from "@/lib/elevenlabs/voice-settings";

function escapeCsv(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function settingsCell(settings: VoiceSettings | null | undefined): string {
  if (!settings) return "";
  const parts: string[] = [];
  if (settings.stability != null) parts.push(`stability=${settings.stability}`);
  if (settings.similarity_boost != null) {
    parts.push(`similarity=${settings.similarity_boost}`);
  }
  if (settings.style != null) parts.push(`style=${settings.style}`);
  if (settings.speed != null) parts.push(`speed=${settings.speed}`);
  return parts.join("; ");
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
    .select("series_id, title")
    .eq("id", id)
    .single();

  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const { data: characters } = await supabase
    .from("characters")
    .select("*")
    .eq("series_id", book.series_id)
    .order("canonical_name");

  const roster = (characters ?? []) as Character[];
  const header =
    "Character,Voice ID,Voice Name,Accent,Locale,Language,Style Descriptor,Voice Settings";
  const rows = roster
    .filter((c) => c.elevenlabs_voice_id)
    .map((c) =>
      [
        escapeCsv(c.canonical_name),
        escapeCsv(c.elevenlabs_voice_id ?? ""),
        escapeCsv(c.elevenlabs_voice_name ?? ""),
        escapeCsv(c.voice_accent ? formatAccentLabel(c.voice_accent) : ""),
        escapeCsv(c.voice_locale ?? ""),
        escapeCsv(c.voice_language ?? ""),
        escapeCsv(c.voice_style ?? ""),
        escapeCsv(settingsCell(c.voice_settings as VoiceSettings | null)),
      ].join(",")
    );

  const csv = [header, ...rows].join("\n");
  const slug = book.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${slug || "book"}-casting-sheet.csv"`,
    },
  });
}
