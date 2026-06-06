import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import {
  createVoiceFromRemixPreview,
  importSharedVoice,
  remixVoiceAccent,
  searchAccentVariants,
} from "@/lib/elevenlabs/api";
import { formatAccentLabel } from "@/lib/elevenlabs/voice-accents";
import { z } from "zod";

export const maxDuration = 120;

const adaptSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("search"),
    voice_name: z.string().min(1),
    target_accent: z.string().min(1),
    gender: z.string().optional(),
  }),
  z.object({
    mode: z.literal("import"),
    public_owner_id: z.string().min(1),
    voice_id: z.string().min(1),
    new_name: z.string().min(1),
    accent: z.string().optional(),
    locale: z.string().optional(),
    language: z.string().optional(),
  }),
  z.object({
    mode: z.literal("remix"),
    voice_id: z.string().min(1),
    voice_name: z.string().min(1),
    target_accent: z.string().min(1),
    character_name: z.string().optional(),
  }),
]);

export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const body = await request.json();
  const parsed = adaptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    if (parsed.data.mode === "search") {
      const variants = await searchAccentVariants({
        voiceName: parsed.data.voice_name,
        targetAccent: parsed.data.target_accent,
        gender: parsed.data.gender,
      });
      return NextResponse.json({ variants });
    }

    if (parsed.data.mode === "import") {
      const imported = await importSharedVoice(
        parsed.data.public_owner_id,
        parsed.data.voice_id,
        parsed.data.new_name
      );
      return NextResponse.json({
        voice_id: imported.voice_id,
        voice_name: imported.name,
        voice_accent: parsed.data.accent ?? null,
        voice_locale: parsed.data.locale ?? null,
        voice_language: parsed.data.language ?? null,
      });
    }

    const accentLabel = formatAccentLabel(parsed.data.target_accent);
    const description = `Speak with a ${accentLabel} accent`;
    const remix = await remixVoiceAccent(parsed.data.voice_id, description);
    const suffix = parsed.data.character_name
      ? ` – ${parsed.data.character_name}`
      : "";
    const newName = `${parsed.data.voice_name} (${accentLabel})${suffix}`.slice(
      0,
      120
    );
    const created = await createVoiceFromRemixPreview({
      generated_voice_id: remix.generated_voice_id,
      voice_name: newName,
      voice_description: description,
      labels: {
        accent: parsed.data.target_accent,
        language: "en",
      },
    });
    return NextResponse.json({
      voice_id: created.voice_id,
      voice_name: created.name,
      voice_accent: parsed.data.target_accent,
      voice_locale: null,
      voice_language: "en",
      preview_audio_base64: remix.audio_base64 ?? null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Adapt failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
