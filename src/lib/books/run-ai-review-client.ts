import type { AiReviewProposal } from "@/lib/books/ai-review-proposals";
import type { AiReviewScope } from "@/lib/books/ai-review-scope";
import type { BookChapterRow } from "@/lib/books/book-chapters";

export type BatchAiReviewProgress = {
  message: string;
  progress: number;
  batch: number;
  pending: number;
  pendingAi?: number;
};

export type AiReviewPreviewOptions = {
  scope?: AiReviewScope;
  chapters?: BookChapterRow[];
  includeAiReviewed?: boolean;
};

/** Run Claude in preview mode (no DB writes) for the full scope in one request. */
export async function runBatchAiReviewPreview(
  bookId: string,
  onProgress?: (update: BatchAiReviewProgress) => void,
  options?: AiReviewPreviewOptions
): Promise<{
  proposals: AiReviewProposal[];
  errors: string[];
  api_calls: number;
}> {
  onProgress?.({
    message: "Connecting to Claude…",
    progress: 5,
    batch: 1,
    pending: 0,
  });

  onProgress?.({
    message: "Reading scenes from your Word file…",
    progress: 15,
    batch: 1,
    pending: 0,
  });

  const res = await fetch(`/api/books/${bookId}/ai-review/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      include_ai_reviewed: options?.includeAiReviewed === true,
      scope:
        options?.scope?.type === "chapter"
          ? { type: "chapter", chapter_id: options.scope.chapterId }
          : { type: "flagged" },
      chapters: options?.chapters,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if ((data as { budget_exceeded?: boolean }).budget_exceeded) {
    const budget = (data as { budget?: { cap: number; spend: number } }).budget;
    throw new Error(
      budget
        ? `AI budget reached ($${budget.spend.toFixed(2)} / $${budget.cap.toFixed(2)}).`
        : "AI budget reached for this book."
    );
  }

  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error ?? "AI preview failed"
    );
  }

  const proposals =
    (data as { proposals?: AiReviewProposal[] }).proposals ?? [];
  const apiCalls = (data as { api_calls?: number }).api_calls ?? 0;
  const errors = (data as { errors?: string[] }).errors ?? [];

  onProgress?.({
    message:
      proposals.length > 0
        ? `${proposals.length.toLocaleString()} suggestions ready`
        : "No changes suggested",
    progress: 100,
    batch: 1,
    pending: proposals.length,
  });

  return { proposals, errors, api_calls: apiCalls };
}

export async function runBatchAiReview(
  bookId: string,
  onProgress?: (update: BatchAiReviewProgress) => void,
  initialFlagged?: number,
  options?: {
    createSnapshot?: boolean;
    includeAiReviewed?: boolean;
    scope?: AiReviewScope;
    chapters?: BookChapterRow[];
  }
): Promise<{
  lines_updated: number;
  lines_cleared: number;
  errors: string[];
  pending_human_review: number;
}> {
  let hasMore = true;
  let linesUpdated = 0;
  let linesCleared = 0;
  const allErrors: string[] = [];
  let batch = 0;
  let startPending = initialFlagged ?? 0;
  let lastPendingHuman = startPending;

  onProgress?.({
    message: "Connecting to Claude…",
    progress: 3,
    batch: 0,
    pending: startPending,
  });

  while (hasMore) {
    batch++;
    const res = await fetch(`/api/books/${bookId}/ai-review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        max_scenes: 12,
        create_snapshot: batch === 1 && options?.createSnapshot === true,
        include_ai_reviewed: options?.includeAiReviewed === true,
        scope:
          options?.scope?.type === "chapter"
            ? { type: "chapter", chapter_id: options.scope.chapterId }
            : { type: "flagged" },
        chapters: options?.chapters,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if ((data as { budget_exceeded?: boolean }).budget_exceeded) {
      const budget = (data as { budget?: { cap: number; spend: number } }).budget;
      throw new Error(
        budget
          ? `AI budget reached ($${budget.spend.toFixed(2)} / $${budget.cap.toFixed(2)}). Increase the book budget on the book page.`
          : "AI budget reached for this book."
      );
    }

    if (!res.ok) {
      throw new Error(
        (data as { error?: string }).error ?? `AI review failed (batch ${batch})`
      );
    }

    linesUpdated += (data as { lines_updated?: number }).lines_updated ?? 0;
    linesCleared += (data as { lines_cleared?: number }).lines_cleared ?? 0;
    hasMore = (data as { has_more?: boolean }).has_more ?? false;

    const scenes = (data as { scenes_processed?: number }).scenes_processed ?? 0;
    const pendingHuman =
      (data as { pending_human_review?: number }).pending_human_review ??
      (data as { pending_flagged?: number }).pending_flagged ??
      0;
    lastPendingHuman = pendingHuman;
    const errs = (data as { errors?: string[] }).errors ?? [];
    allErrors.push(...errs);

    if (batch === 1 && startPending === 0 && pendingHuman > 0) {
      startPending = pendingHuman;
    }

    if (hasMore && scenes === 0) {
      if (errs.length > 0) {
        throw new Error(errs[0] ?? "AI review stalled");
      }
      hasMore = false;
    }

    let progress: number;
    if (startPending > 0) {
      const clearedForHuman = Math.max(0, startPending - pendingHuman);
      progress = hasMore
        ? Math.min(95, Math.round((clearedForHuman / startPending) * 100))
        : 100;
    } else {
      progress = hasMore ? Math.min(95, Math.min(batch * 8, 90)) : 100;
    }

    onProgress?.({
      message: `Batch ${batch}: reviewed ${scenes} scene${scenes === 1 ? "" : "s"}…`,
      progress,
      batch,
      pending: pendingHuman,
    });
  }

  onProgress?.({
    message: "AI review complete",
    progress: 100,
    batch,
    pending: lastPendingHuman,
  });

  return {
    lines_updated: linesUpdated,
    lines_cleared: linesCleared,
    errors: allErrors,
    pending_human_review: lastPendingHuman,
  };
}
