import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/api/auth";
import { removeDetectedSpeaker } from "@/lib/books/speaker-character-actions";
import { z } from "zod";

const removeSchema = z.object({
  speaker_label: z.string().min(1).max(200),
  character_id: z.string().uuid().nullable().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id: bookId } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = removeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const result = await removeDetectedSpeaker(admin, bookId, {
      speakerLabel: parsed.data.speaker_label,
      characterId: parsed.data.character_id ?? null,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Remove failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
