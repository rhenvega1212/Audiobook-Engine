import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/api/auth";
import { fetchAllTaggedLines } from "@/lib/supabase/fetch-all";
import {
  describeAiEligibility,
  summarizeAiReviewEligibility,
} from "@/lib/books/ai-review-eligibility";
import type { AiReviewScope } from "@/lib/books/ai-review-scope";
import type { BookChapterRow } from "@/lib/books/book-chapters";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id } = await params;
  const url = new URL(request.url);
  const includeAiReviewed = url.searchParams.get("include_ai_reviewed") === "1";
  const fullScrub = url.searchParams.get("full_scrub") === "1";
  const respectHumanReviewed =
    url.searchParams.get("respect_human_reviewed") !== "0";
  const chapterId = url.searchParams.get("chapter_id");

  let scope: AiReviewScope = { type: "flagged" };
  if (chapterId) {
    scope = { type: "chapter", chapterId };
  }

  const admin = createAdminClient();
  const lines = await fetchAllTaggedLines(admin, id, "*");

  const { data: chapters } = await admin
    .from("book_chapters")
    .select(
      "id, book_id, sort_order, title, start_line_id, start_line_order, source"
    )
    .eq("book_id", id)
    .order("start_line_order");

  const stats = summarizeAiReviewEligibility(
    lines,
    scope,
    (chapters ?? []) as BookChapterRow[],
    { includeAiReviewed, respectHumanReviewed, fullScrub }
  );

  return NextResponse.json({
    ...stats,
    summary: describeAiEligibility(stats),
  });
}
