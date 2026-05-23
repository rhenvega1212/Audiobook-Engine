import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/api/auth";
import { createEngineCharacter } from "@/lib/engine/types";
import { runAiAssistedPass } from "@/lib/engine/ai-attribution";
import type { TaggedLine } from "@/lib/engine/types";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  const { id } = await params;
  const admin = createAdminClient();

  const { data: book } = await admin
    .from("books")
    .select("series_id")
    .eq("id", id)
    .single();

  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const { data: chars } = await admin
    .from("characters")
    .select("*")
    .eq("series_id", book.series_id);

  const roster = (chars ?? []).map((c) =>
    createEngineCharacter(c.canonical_name, c.aliases ?? [], c.gender)
  );

  const { data: dbLines } = await admin
    .from("tagged_lines")
    .select("*")
    .eq("book_id", id)
    .order("line_order");

  const engineLines: TaggedLine[] = (dbLines ?? []).map((l) => ({
    speaker: l.speaker_label,
    line: l.line_text,
    paragraph_num: l.paragraph_num,
    confidence: l.confidence ?? "none",
    flag_reason: l.flag_reason,
  }));

  const result = await runAiAssistedPass(engineLines, roster, apiKey);

  for (let i = 0; i < (dbLines ?? []).length; i++) {
    const updated = result.lines[i];
    const dbLine = dbLines![i];
    if (!updated || !dbLine.flag_reason) continue;

    const char = (chars ?? []).find(
      (c) => c.canonical_name === updated.speaker
    );

    await admin
      .from("tagged_lines")
      .update({
        speaker_label: updated.speaker,
        speaker_character_id: char?.id ?? null,
        confidence: updated.confidence,
        flag_reason: updated.flag_reason,
        ai_reviewed: true,
      })
      .eq("id", dbLine.id);
  }

  return NextResponse.json({
    scenes_total: result.scenes_total,
    scenes_processed: result.scenes_processed,
    lines_updated: result.lines_updated,
    api_calls: result.api_calls,
  });
}
