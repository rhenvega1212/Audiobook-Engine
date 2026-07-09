import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/api/auth";
import { previewAiReviewForBook } from "@/lib/books/run-ai-review";
import type { AiReviewScope } from "@/lib/books/ai-review-scope";
import type { BookChapterRow } from "@/lib/books/book-chapters";

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
  let includeAiReviewed = false;
  let fullScrub = false;
  let dialogueOnly = false;
  let respectHumanReviewed = true;
  let scope: AiReviewScope = { type: "flagged" };
  let chapters: BookChapterRow[] = [];
  let processedIndices: number[] = [];

  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.max_scenes === "number" && body.max_scenes > 0) {
      maxScenes = Math.min(body.max_scenes, 30);
    }
    if (body.include_ai_reviewed === true) includeAiReviewed = true;
    if (body.full_scrub === true) fullScrub = true;
    if (body.dialogue_only === true) dialogueOnly = true;
    if (body.respect_human_reviewed === false) respectHumanReviewed = false;
    if (body.scope?.type === "chapter" && body.scope.chapter_id) {
      scope = { type: "chapter", chapterId: body.scope.chapter_id };
    }
    if (Array.isArray(body.chapters)) {
      chapters = body.chapters as BookChapterRow[];
    }
    if (Array.isArray(body.processed_indices)) {
      processedIndices = body.processed_indices.filter(
        (n: unknown) => typeof n === "number" && Number.isFinite(n)
      );
    }
  } catch {
    // defaults
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

  try {
    const result = await previewAiReviewForBook(admin, id, apiKey, {
      maxScenes,
      includeAiReviewed,
      respectHumanReviewed,
      fullScrub,
      dialogueOnly,
      scope,
      chapters,
      processedIndices,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "AI preview failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
