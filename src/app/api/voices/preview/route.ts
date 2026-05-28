import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { synthesizeSpeech } from "@/lib/elevenlabs/api";
import { z } from "zod";

const previewSchema = z.object({
  voice_id: z.string(),
  text: z.string().min(1).max(2500),
});

export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const body = await request.json();
  const parsed = previewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const audioBuffer = await synthesizeSpeech(
      parsed.data.voice_id,
      parsed.data.text
    );
    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Preview failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
