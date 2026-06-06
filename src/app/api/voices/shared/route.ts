import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { searchSharedVoices } from "@/lib/elevenlabs/api";

export async function GET(request: Request) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const url = new URL(request.url);
  const search = url.searchParams.get("search") ?? undefined;
  const gender = url.searchParams.get("gender") ?? undefined;
  const age = url.searchParams.get("age") ?? undefined;
  const language = url.searchParams.get("language") ?? undefined;
  const accent = url.searchParams.get("accent") ?? undefined;
  const page = Number(url.searchParams.get("page") ?? "0");
  const page_size = Number(url.searchParams.get("page_size") ?? "100");

  try {
    const result = await searchSharedVoices({
      search,
      gender,
      age,
      language,
      accent,
      page,
      page_size,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Voice library search failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
