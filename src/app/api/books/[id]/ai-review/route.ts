import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/api/auth";
import { runAiReviewForBook } from "@/lib/books/run-ai-review";

export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  const { id } = await params;
  const admin = createAdminClient();

  let maxScenes = 12;
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.max_scenes === "number" && body.max_scenes > 0) {
      maxScenes = Math.min(body.max_scenes, 30);
    }
  } catch {
    // empty body is fine
  }

  try {
    const result = await runAiReviewForBook(admin, id, apiKey, { maxScenes });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "AI review failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
