export type BatchAiReviewProgress = {
  message: string;
  progress: number;
  batch: number;
  pending: number;
};

export async function runBatchAiReview(
  bookId: string,
  onProgress?: (update: BatchAiReviewProgress) => void,
  initialFlagged?: number
): Promise<{
  lines_updated: number;
  lines_cleared: number;
  errors: string[];
}> {
  let hasMore = true;
  let linesUpdated = 0;
  let linesCleared = 0;
  const allErrors: string[] = [];
  let batch = 0;
  let startPending = initialFlagged ?? 0;

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
      body: JSON.stringify({ max_scenes: 12 }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(
        (data as { error?: string }).error ?? `AI review failed (batch ${batch})`
      );
    }

    linesUpdated += (data as { lines_updated?: number }).lines_updated ?? 0;
    linesCleared += (data as { lines_cleared?: number }).lines_cleared ?? 0;
    hasMore = (data as { has_more?: boolean }).has_more ?? false;

    const scenes = (data as { scenes_processed?: number }).scenes_processed ?? 0;
    const pending = (data as { pending_flagged?: number }).pending_flagged ?? 0;
    const errs = (data as { errors?: string[] }).errors ?? [];
    allErrors.push(...errs);

    if (batch === 1 && startPending === 0 && pending > 0) {
      startPending = pending + linesCleared;
    }

    let progress: number;
    if (startPending > 0) {
      const reviewed = Math.max(0, startPending - pending);
      progress = hasMore
        ? Math.min(95, Math.round((reviewed / startPending) * 100))
        : 100;
    } else {
      progress = hasMore ? Math.min(90, batch * 10) : 100;
    }

    const message = hasMore
      ? `Batch ${batch}: reviewed ${scenes} scene${scenes === 1 ? "" : "s"}, ${pending.toLocaleString()} flagged remaining…`
      : `Finished — cleared ${linesCleared.toLocaleString()} flag${linesCleared === 1 ? "" : "s"}`;

    onProgress?.({ message, progress, batch, pending });

    if (hasMore && scenes === 0 && errs.length > 0) {
      const first = errs[0] ?? "AI review stalled";
      throw new Error(
        first.includes("not_found_error") && first.includes("model:")
          ? "Claude model not found — set ANTHROPIC_MODEL=claude-sonnet-4-6 in .env.local and restart the dev server"
          : first
      );
    }
  }

  onProgress?.({
    message: "AI review complete",
    progress: 100,
    batch,
    pending: 0,
  });

  return { lines_updated: linesUpdated, lines_cleared: linesCleared, errors: allErrors };
}
