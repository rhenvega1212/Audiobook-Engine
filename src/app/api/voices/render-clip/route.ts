import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import {
  synthesizeSpeech,
  ElevenLabsRequestError,
} from "@/lib/elevenlabs/api";
import { normalizeVoiceSettings } from "@/lib/elevenlabs/voice-settings";
import { z } from "zod";

export const maxDuration = 120;

const voiceSettingsSchema = z.object({
  stability: z.number().min(0).max(1).optional(),
  similarity_boost: z.number().min(0).max(1).optional(),
  style: z.number().min(0).max(1).optional(),
  speed: z.number().min(0.5).max(2).optional(),
  use_speaker_boost: z.boolean().optional(),
});

const renderClipSchema = z.object({
  voice_id: z.string(),
  text: z.string().min(1).max(5000),
  language_code: z.string().min(2).max(10).nullable().optional(),
  voice_settings: voiceSettingsSchema.nullable().optional(),
});

const MAX_ATTEMPTS = 4;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Renders a single audiobook clip as MP3 (44.1kHz/128k source; the browser
 * re-masters to the final 192k CBR). Retries on rate-limit / transient errors
 * so a full-book render doesn't fail on a single hiccup.
 */
export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const body = await request.json();
  const parsed = renderClipSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const audioBuffer = await synthesizeSpeech(
        parsed.data.voice_id,
        parsed.data.text,
        {
          language_code: parsed.data.language_code,
          voice_settings: normalizeVoiceSettings(parsed.data.voice_settings),
          output_format: "mp3_44100_128",
        }
      );
      return new NextResponse(audioBuffer, {
        headers: { "Content-Type": "audio/mpeg" },
      });
    } catch (e) {
      lastError = e;
      const status = e instanceof ElevenLabsRequestError ? e.status : 0;
      const retryable = status === 429 || status === 0 || status >= 500;
      if (!retryable || attempt === MAX_ATTEMPTS) break;
      // Exponential backoff: 0.5s, 1s, 2s
      await sleep(500 * 2 ** (attempt - 1));
    }
  }

  const message =
    lastError instanceof Error ? lastError.message : "Clip render failed";
  const status =
    lastError instanceof ElevenLabsRequestError && lastError.status === 429
      ? 429
      : 502;
  return NextResponse.json({ error: message }, { status });
}
