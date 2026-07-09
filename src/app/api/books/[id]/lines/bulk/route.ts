import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/api/auth";
import { lineBulkUpdateSchema } from "@/lib/validations";
import { updateBookStatus } from "@/lib/books/compute-book-status";
import { createUndoCheckpoint } from "@/lib/books/manuscript-snapshot";
import { recordAttributionCorrections } from "@/lib/books/attribution-corrections";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id: bookId } = await params;
  const body = await request.json();
  const parsed = lineBulkUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { line_ids, ...fields } = parsed.data;
  const updates = {
    ...fields,
    ...(fields.flag_reason === null ? { human_reviewed: true } : {}),
    ...(fields.speaker_label != null ? { human_reviewed: true } : {}),
  };

  const admin = createAdminClient();
  await createUndoCheckpoint(admin, bookId, "Before bulk edit");

  // Capture the pre-edit speakers for teaching examples when this is a bulk
  // speaker reassignment.
  type OldLine = {
    id: string;
    speaker_label: string;
    speaker_character_id: string | null;
    line_order: number;
    paragraph_num: number;
    line_text: string;
    ai_reviewed: boolean | null;
    confidence: string | null;
    flag_reason: string | null;
  };
  let oldLines: OldLine[] = [];
  if (fields.speaker_label != null) {
    const { data: existing } = await admin
      .from("tagged_lines")
      .select(
        "id, speaker_label, speaker_character_id, line_order, paragraph_num, line_text, ai_reviewed, confidence, flag_reason"
      )
      .eq("book_id", bookId)
      .in("id", line_ids);
    oldLines = (existing ?? []) as OldLine[];
  }

  const supabase = await createClient();
  const { data, error: dbError } = await supabase
    .from("tagged_lines")
    .update(updates)
    .eq("book_id", bookId)
    .in("id", line_ids)
    .select("id");

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  if (fields.speaker_label != null && oldLines.length > 0) {
    const newSpeaker = fields.speaker_label;
    await recordAttributionCorrections(
      admin,
      bookId,
      oldLines.map((l) => ({
        lineId: l.id,
        lineOrder: l.line_order,
        paragraphNum: l.paragraph_num,
        lineText: l.line_text,
        oldSpeaker: l.speaker_label,
        newSpeaker,
        oldCharacterId: l.speaker_character_id,
        newCharacterId: fields.speaker_character_id ?? null,
        wasAiReviewed: l.ai_reviewed ?? false,
        priorConfidence: l.confidence,
        priorFlagReason: l.flag_reason,
      }))
    );
  }

  const status = await updateBookStatus(admin, bookId);

  return NextResponse.json({
    updated: data?.length ?? 0,
    book_status: status,
  });
}
