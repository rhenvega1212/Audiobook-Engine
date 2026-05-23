import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";

export async function GET() {
  const { user, error } = await requireUser();
  if (!user) return error;

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ELEVENLABS_API_KEY not configured" },
      { status: 500 }
    );
  }

  const res = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": apiKey },
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: "Failed to fetch voices from ElevenLabs" },
      { status: 502 }
    );
  }

  const data = await res.json();
  return NextResponse.json(data);
}
