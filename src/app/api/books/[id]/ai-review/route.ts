import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/api/auth";
import {
  runAiReviewForBook,
  getLatestAiReviewSnapshot,
} from "@/lib/books/run-ai-review";
import { restoreLatestAiReviewSnapshot } from "@/lib/books/ai-review-snapshot";
import { updateBookStatus } from "@/lib/books/compute-book-status";
import type { AiReviewScope } from "@/lib/books/ai-review-scope";
import type { BookChapterRow } from "@/lib/books/book-chapters";

export const maxDuration = 300;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id } = await params;
  const admin = createAdminClient();
  const snapshot = await getLatestAiReviewSnapshot(admin, id);

  return NextResponse.json({
    can_undo: !!snapshot,
    snapshot: snapshot
      ? {
          id: snapshot.id,
          created_at: snapshot.created_at,
          line_count: snapshot.line_count,
        }
      : null,
  });
}

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
  let createSnapshot = false;
  let includeAiReviewed = false;
  let fullScrub = false;
  let respectHumanReviewed = true;
  let undo = false;
  let scope: AiReviewScope = { type: "flagged" };
  let chapters: BookChapterRow[] = [];

  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.max_scenes === "number" && body.max_scenes > 0) {
      maxScenes = Math.min(body.max_scenes, 30);
    }
    if (body.create_snapshot === true) createSnapshot = true;
    if (body.include_ai_reviewed === true) includeAiReviewed = true;
    if (body.full_scrub === true) fullScrub = true;
    if (body.respect_human_reviewed === false) respectHumanReviewed = false;
    if (body.undo === true) undo = true;
    if (body.scope?.type === "chapter" && body.scope.chapter_id) {
      scope = { type: "chapter", chapterId: body.scope.chapter_id };
    }
    if (Array.isArray(body.chapters)) {
      chapters = body.chapters as BookChapterRow[];
    }
  } catch {
    // empty body is fine
  }

  if (scope.type === "chapter" && chapters.length === 0) {
    const { data } = await admin
      .from("book_chapters")
      .select(
        "id, book_id, sort_order, title, start_line_id, start_line_order, source"
      )
      .eq("book_id", id)
      .order("start_line_order");
    chapters = (data ?? []) as BookChapterRow[];
  }

  if (undo) {
    try {
      const { restored } = await restoreLatestAiReviewSnapshot(admin, id);
      const status = await updateBookStatus(admin, id);
      return NextResponse.json({ restored, status, undone: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Undo failed";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  try {
    const result = await runAiReviewForBook(admin, id, apiKey, {
      maxScenes,
      createSnapshot,
      includeAiReviewed,
      respectHumanReviewed,
      fullScrub,
      scope,
      chapters,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "AI review failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
