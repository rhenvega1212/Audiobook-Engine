import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/api/auth";
import { applyAiReviewProposals } from "@/lib/books/run-ai-review";

const bodySchema = z.object({
  items: z
    .array(
      z.object({
        line_id: z.string().uuid(),
        speaker: z.string().min(1),
        confidence: z.string(),
        accept: z.boolean(),
      })
    )
    .min(1),
  create_snapshot: z.boolean().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id } = await params;
  const admin = createAdminClient();

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await applyAiReviewProposals(
      admin,
      id,
      parsed.data.items,
      { createSnapshot: parsed.data.create_snapshot !== false }
    );
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Apply failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
