import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { analyzeBook } from "@/lib/books/analyze-book";

export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id } = await params;

  let runAiReview = false;
  try {
    const body = await request.json().catch(() => ({}));
    if (body.run_ai_review === true) {
      runAiReview = true;
    }
  } catch {
    // empty body — skip AI review for faster, reliable re-runs
  }

  try {
    const summary = await analyzeBook(id, { runAiReview });
    return NextResponse.json(summary);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
