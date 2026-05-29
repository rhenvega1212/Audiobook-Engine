import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/api/auth";
import { updateBookStatus } from "@/lib/books/compute-book-status";
import {
  isEligibleForAcceptAi,
  listAcceptAiCandidates,
} from "@/lib/books/accept-ai-lines";

const bodySchema = z.object({
  line_ids: z.array(z.string().uuid()).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id } = await params;
  const admin = createAdminClient();

  let lineIds: string[] | undefined;
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (parsed.success && parsed.data.line_ids?.length) {
      lineIds = parsed.data.line_ids;
    }
  } catch {
    // empty body — accept all eligible
  }

  const { data: lines } = await admin
    .from("tagged_lines")
    .select(
      "id, flag_reason, ai_reviewed, confidence, line_order, speaker_label, line_text"
    )
    .eq("book_id", id)
    .not("flag_reason", "is", null);

  const eligible = listAcceptAiCandidates(lines ?? []);
  const idSet = lineIds ? new Set(lineIds) : null;
  const toAccept = idSet
    ? eligible.filter((c) => idSet.has(c.id))
    : eligible;

  let accepted = 0;
  for (const candidate of toAccept) {
    const row = lines?.find((l) => l.id === candidate.id);
    if (!row || !isEligibleForAcceptAi(row)) continue;

    await admin
      .from("tagged_lines")
      .update({
        flag_reason: null,
        human_reviewed: true,
      })
      .eq("id", candidate.id);
    accepted++;
  }

  const status = await updateBookStatus(admin, id);

  return NextResponse.json({ accepted, status, requested: lineIds?.length ?? null });
}
