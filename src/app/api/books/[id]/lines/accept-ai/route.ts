import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/api/auth";
import { updateBookStatus } from "@/lib/books/compute-book-status";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id } = await params;
  const admin = createAdminClient();

  const { data: lines } = await admin
    .from("tagged_lines")
    .select("id, flag_reason, ai_reviewed, confidence")
    .eq("book_id", id)
    .not("flag_reason", "is", null);

  let accepted = 0;
  for (const line of lines ?? []) {
    const fr = line.flag_reason ?? "";
    const isAiConfirmed =
      line.ai_reviewed &&
      (fr.startsWith("ai_confirmed") ||
        fr.includes("ai_reviewed") ||
        line.confidence === "high" ||
        line.confidence === "medium");

    if (!isAiConfirmed) continue;

    await admin
      .from("tagged_lines")
      .update({
        flag_reason: null,
        human_reviewed: true,
      })
      .eq("id", line.id);
    accepted++;
  }

  const status = await updateBookStatus(admin, id);

  return NextResponse.json({ accepted, status });
}
