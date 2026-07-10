import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/api/auth";
import { renameDetectedSpeaker } from "@/lib/books/speaker-character-actions";
import { z } from "zod";

const renameSchema = z.object({
  speaker_label: z.string().min(1).max(200),
  new_name: z.string().min(1).max(200),
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
  const parsed = renameSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const result = await renameDetectedSpeaker(admin, bookId, {
      speakerLabel: parsed.data.speaker_label,
      newName: parsed.data.new_name,
      characterId: parsed.data.character_id ?? null,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Rename failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
