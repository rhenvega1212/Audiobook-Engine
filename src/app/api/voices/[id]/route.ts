import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { fetchVoiceDetail } from "@/lib/elevenlabs/api";
import { accentOptionsFromVerifiedLanguages } from "@/lib/elevenlabs/voice-accents";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id } = await params;

  try {
    const detail = await fetchVoiceDetail(id);
    const accent_options = accentOptionsFromVerifiedLanguages(
      detail.verified_languages
    );
    return NextResponse.json({ ...detail, accent_options });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load voice";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
