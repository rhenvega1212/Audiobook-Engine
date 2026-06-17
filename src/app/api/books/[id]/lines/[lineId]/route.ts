import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/api/auth";
import { lineUpdateSchema } from "@/lib/validations";
import { updateBookStatus } from "@/lib/books/compute-book-status";
import { ensureEditCheckpoint } from "@/lib/books/manuscript-snapshot";

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

  if (isProtectedEdit(updates)) {
    const admin = createAdminClient();
    await ensureEditCheckpoint(admin, id);
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

  return NextResponse.json({ ...data, book_status: status });
}
