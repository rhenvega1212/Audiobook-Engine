import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/api/auth";
import { lineUpdateSchema } from "@/lib/validations";
import { updateBookStatus } from "@/lib/books/compute-book-status";
import { createUndoCheckpoint } from "@/lib/books/manuscript-snapshot";
import { recordAttributionCorrections } from "@/lib/books/attribution-corrections";

function isProtectedEdit(payload: Record<string, unknown>): boolean {
  return (
    payload.flag_reason !== undefined ||
    payload.human_reviewed === true ||
    payload.speaker_label !== undefined ||
    payload.speaker_character_id !== undefined ||
    payload.line_text !== undefined ||
    payload.excluded_from_export !== undefined ||
    payload.spoken_text !== undefined
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; lineId: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id, lineId } = await params;
  const body = await request.json();
  const parsed = lineUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid line update", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const payload = parsed.data;
  const updates: Record<string, unknown> = { ...payload };

  if (payload.human_reviewed === undefined) {
    const speakerOnly =
      payload.speaker_label !== undefined ||
      payload.speaker_character_id !== undefined;
    if (!speakerOnly) {
      updates.human_reviewed = true;
    } else {
      delete updates.human_reviewed;
    }
  }

  if (
    payload.human_reviewed === true &&
    payload.flag_reason === undefined
  ) {
    updates.flag_reason = null;
  }

  const speakerEdit =
    payload.speaker_label !== undefined ||
    payload.speaker_character_id !== undefined;

  // Snapshot the pre-edit speaker so we can persist the wrong→right correction
  // as a teaching example before the update overwrites it.
  let oldLine:
    | {
        speaker_label: string;
        speaker_character_id: string | null;
        line_order: number;
        paragraph_num: number;
        ai_reviewed: boolean | null;
        confidence: string | null;
        flag_reason: string | null;
      }
    | null = null;
  if (speakerEdit) {
    const { data: existing } = await supabase
      .from("tagged_lines")
      .select(
        "speaker_label, speaker_character_id, line_order, paragraph_num, ai_reviewed, confidence, flag_reason"
      )
      .eq("id", lineId)
      .eq("book_id", id)
      .maybeSingle();
    oldLine = existing;
  }

  if (isProtectedEdit(updates)) {
    const admin = createAdminClient();
    await createUndoCheckpoint(admin, id, "Before line edit");
  }

  const { data, error: dbError } = await supabase
    .from("tagged_lines")
    .update(updates)
    .eq("id", lineId)
    .eq("book_id", id)
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Line not found or not updated" }, { status: 404 });
  }

  const admin = createAdminClient();
  const status = await updateBookStatus(admin, id);

  if (speakerEdit && oldLine && oldLine.speaker_label !== data.speaker_label) {
    await recordAttributionCorrections(admin, id, [
      {
        lineId,
        lineOrder: oldLine.line_order,
        paragraphNum: oldLine.paragraph_num,
        lineText: data.line_text,
        oldSpeaker: oldLine.speaker_label,
        newSpeaker: data.speaker_label,
        oldCharacterId: oldLine.speaker_character_id,
        newCharacterId: data.speaker_character_id,
        wasAiReviewed: oldLine.ai_reviewed ?? false,
        priorConfidence: oldLine.confidence,
        priorFlagReason: oldLine.flag_reason,
      },
    ]);
  }

  return NextResponse.json({ ...data, book_status: status });
}
