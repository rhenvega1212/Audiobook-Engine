import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { fetchMyVoices } from "@/lib/elevenlabs/api";

export async function GET(request: Request) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const search = new URL(request.url).searchParams.get("search") ?? undefined;

  try {
    const voices = await fetchMyVoices(search);
    return NextResponse.json({ voices });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to fetch voices";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
