import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/api/auth";
import { repairSpeechTagsInBook } from "@/lib/books/repair-speech-tags";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id } = await params;

  try {
    const admin = createAdminClient();
    const result = await repairSpeechTagsInBook(admin, id);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Repair failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
