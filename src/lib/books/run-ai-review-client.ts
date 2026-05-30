export type BatchAiReviewProgress = {
  message: string;
  progress: number;
  batch: number;
  /** Flagged lines still needing human review (may include ai_confirmed). */
  pending: number;
  /** Lines not yet processed by AI this run. */
  pendingAi?: number;
};

function formatBatchMessage(
  batch: number,
  scenes: number,
  pendingAi: number,
  pendingHuman: number,
  hasMore: boolean
): string {
  if (!hasMore) {
    if (pendingHuman > 0) {
      return `AI finished — ${pendingHuman.toLocaleString()} line${pendingHuman === 1 ? "" : "s"} still flagged for your review`;
    }
    return "AI review complete — no flagged lines remaining";
  }
  if (scenes === 0 && pendingAi === 0 && pendingHuman > 0) {
    return `AI finished — ${pendingHuman.toLocaleString()} line${pendingHuman === 1 ? "" : "s"} need human review (Accept AI or confirm in Review)`;
  }
  const aiPart =
    pendingAi > 0 ? `, ${pendingAi.toLocaleString()} awaiting AI` : "";
  return `Batch ${batch}: reviewed ${scenes} scene${scenes === 1 ? "" : "s"} — ${pendingHuman.toLocaleString()} flagged for review${aiPart}…`;
}

export async function runBatchAiReview(
  bookId: string,
  onProgress?: (update: BatchAiReviewProgress) => void,
  initialFlagged?: number
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
      body: JSON.stringify({ max_scenes: 12 }),
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
    const pendingAi =
      (data as { pending_ai?: number }).pending_ai ??
      (hasMore ? 1 : 0);
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

    // No scenes ran but API says more work — avoid infinite loop (stale has_more guard)
    if (hasMore && scenes === 0) {
      if (errs.length > 0) {
        const first = errs[0] ?? "AI review stalled";
        throw new Error(
          first.includes("not_found_error") && first.includes("model:")
            ? "Claude model not found — set ANTHROPIC_MODEL=claude-sonnet-4-6 in .env.local and restart the dev server"
            : first
        );
      }
      hasMore = pendingAi > 0;
      if (!hasMore) {
        break;
      }
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

    const message = formatBatchMessage(
      batch,
      scenes,
      pendingAi,
      pendingHuman,
      hasMore
    );

    onProgress?.({
      message,
      progress,
      batch,
      pending: pendingHuman,
      pendingAi,
    });
  }

  const doneMessage =
    lastPendingHuman > 0
      ? `AI complete — ${lastPendingHuman.toLocaleString()} line${lastPendingHuman === 1 ? "" : "s"} for human review`
      : "AI review complete";

  onProgress?.({
    message: doneMessage,
    progress: 100,
    batch,
    pending: lastPendingHuman,
    pendingAi: 0,
  });

  return {
    lines_updated: linesUpdated,
    lines_cleared: linesCleared,
    errors: allErrors,
    pending_human_review: lastPendingHuman,
  };
}
