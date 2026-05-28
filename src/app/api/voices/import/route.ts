import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { importSharedVoice } from "@/lib/elevenlabs/api";

const importSchema = z.object({
  public_user_id: z.string().min(1),
  voice_id: z.string().min(1),
  new_name: z.string().min(1).max(100),
});

export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const body = await request.json();
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const voice = await importSharedVoice(
      parsed.data.public_user_id,
      parsed.data.voice_id,
      parsed.data.new_name
    );
    return NextResponse.json(voice);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
