import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { synthesizeSpeech } from "@/lib/elevenlabs/api";
import { normalizeVoiceSettings } from "@/lib/elevenlabs/voice-settings";
import { z } from "zod";

const voiceSettingsSchema = z.object({
  stability: z.number().min(0).max(1).optional(),
  similarity_boost: z.number().min(0).max(1).optional(),
  style: z.number().min(0).max(1).optional(),
  speed: z.number().min(0.5).max(2).optional(),
  use_speaker_boost: z.boolean().optional(),
});

const previewSchema = z.object({
  voice_id: z.string(),
  text: z.string().min(1).max(2500),
  language_code: z.string().min(2).max(10).nullable().optional(),
  voice_settings: voiceSettingsSchema.nullable().optional(),
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
      parsed.data.text,
      {
        language_code: parsed.data.language_code,
        voice_settings: normalizeVoiceSettings(parsed.data.voice_settings),
      }
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
