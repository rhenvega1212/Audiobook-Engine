import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/api/auth";
import { listAcceptAiCandidates } from "@/lib/books/accept-ai-lines";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id } = await params;
  const admin = createAdminClient();

  const { data: lines, error: fetchError } = await admin
    .from("tagged_lines")
    .select(
      "id, line_order, speaker_label, line_text, flag_reason, confidence, ai_reviewed"
    )
    .eq("book_id", id)
    .not("flag_reason", "is", null);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const candidates = listAcceptAiCandidates(lines ?? []);
  return NextResponse.json({ candidates, count: candidates.length });
}
