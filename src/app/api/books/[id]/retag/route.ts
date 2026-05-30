import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { retagBook } from "@/lib/books/retag-book";

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
    if (body.run_ai_review === true) runAiReview = true;
  } catch {
    // empty body ok
  }

  try {
    const summary = await retagBook(id, { runAiReview });
    return NextResponse.json(summary);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Re-tag failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
