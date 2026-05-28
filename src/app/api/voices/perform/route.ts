import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { convertSpeechToSpeech } from "@/lib/elevenlabs/api";

export const maxDuration = 60;

export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (!user) return error;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const voiceId = formData.get("voice_id");
  const audio = formData.get("audio");

  if (typeof voiceId !== "string" || !voiceId) {
    return NextResponse.json({ error: "voice_id is required" }, { status: 400 });
  }

  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: "audio recording is required" }, { status: 400 });
  }

  if (audio.size > 10 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Recording too large (max 10 MB)" },
      { status: 400 }
    );
  }

  const filename =
    audio instanceof File && audio.name ? audio.name : "recording.webm";

  try {
    const buffer = await convertSpeechToSpeech(voiceId, audio, filename);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Voice conversion failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
