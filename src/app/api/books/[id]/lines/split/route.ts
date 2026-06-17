import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/api/auth";
import { lineSplitSchema } from "@/lib/validations";
import { splitTaggedLine } from "@/lib/books/line-operations";
import { ensureEditCheckpoint } from "@/lib/books/manuscript-snapshot";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id: bookId } = await params;
  const body = await request.json();
  const parsed = lineSplitSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    await ensureEditCheckpoint(admin, bookId);
    const result = await splitTaggedLine(
      admin,
      bookId,
      parsed.data.line_id,
      parsed.data.start,
      parsed.data.end,
      {
        speaker_label: parsed.data.speaker_label,
        speaker_character_id: parsed.data.speaker_character_id,
      }
    );
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Split failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
