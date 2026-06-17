"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AiReviewEligibilityStats } from "@/lib/books/ai-review-eligibility";
import { describeAiEligibility } from "@/lib/books/ai-review-eligibility";
import type { AiReviewScope } from "@/lib/books/ai-review-scope";

export type AiReviewMode = "respect_manual" | "full_scrub";

export type AiReviewLaunchOptions = {
  mode: AiReviewMode;
  scope: AiReviewScope;
  includeAiReviewed: boolean;
  respectHumanReviewed: boolean;
  fullScrub: boolean;
};

export function AiReviewSetupDialog({
  bookId,
  open,
  onOpenChange,
  scope,
  scopeLabel,
  onLaunch,
  busy = false,
}: {
  bookId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: AiReviewScope;
  scopeLabel: string;
  onLaunch: (options: AiReviewLaunchOptions) => void;
  busy?: boolean;
}) {
  const [mode, setMode] = useState<AiReviewMode>("respect_manual");
  const [includeAiReviewed, setIncludeAiReviewed] = useState(false);
  const [eligibility, setEligibility] = useState<AiReviewEligibilityStats | null>(
    null
  );
  const [summary, setSummary] = useState("");
  const [loadingEligibility, setLoadingEligibility] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode("respect_manual");
    setIncludeAiReviewed(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingEligibility(true);

    const params = new URLSearchParams();
    if (mode === "full_scrub") {
      params.set("full_scrub", "1");
      params.set("respect_human_reviewed", "0");
      params.set("include_ai_reviewed", "1");
    } else if (includeAiReviewed) {
      params.set("include_ai_reviewed", "1");
    }
    if (scope.type === "chapter") {
      params.set("chapter_id", scope.chapterId);
    }

    void fetch(`/api/books/${bookId}/ai-review/eligibility?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setEligibility(data as AiReviewEligibilityStats);
        setSummary(
          typeof (data as { summary?: string }).summary === "string"
            ? (data as { summary: string }).summary
            : describeAiEligibility(data as AiReviewEligibilityStats)
        );
      })
      .catch(() => {
        if (!cancelled) {
          setEligibility(null);
          setSummary("");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingEligibility(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, bookId, mode, includeAiReviewed, scope]);

  function handleLaunch() {
    const fullScrub = mode === "full_scrub";
    onLaunch({
      mode,
      scope,
      includeAiReviewed: fullScrub || includeAiReviewed,
      respectHumanReviewed: !fullScrub,
      fullScrub,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Review lines with AI</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 text-body-sm pt-1">
              <p>
                Claude reads scenes from your <strong>original Word file</strong>{" "}
                and suggests speakers. Low-confidence lines stay flagged for you;
                high-confidence matches can clear flags.
              </p>
              <p className="text-slate">
                Scope: <strong className="text-ink">{scopeLabel}</strong>
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <fieldset className="space-y-2">
            <legend className="text-body-sm font-medium">Assignment mode</legend>
            <label className="flex items-start gap-2 text-body-sm cursor-pointer rounded-md border border-border-muted p-3 has-[:checked]:border-teal/50 has-[:checked]:bg-teal/5">
              <input
                type="radio"
                name="ai-review-mode"
                checked={mode === "respect_manual"}
                onChange={() => setMode("respect_manual")}
                className="mt-1"
              />
              <span>
                <strong className="text-ink">Respect manual edits</strong>
                <span className="block text-slate mt-0.5">
                  Skips lines you changed or confirmed in Review / Speaker studio.
                  Reviews flagged and uncertain lines only.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-body-sm cursor-pointer rounded-md border border-dark-red/30 p-3 has-[:checked]:border-dark-red/60 has-[:checked]:bg-dark-red/5">
              <input
                type="radio"
                name="ai-review-mode"
                checked={mode === "full_scrub"}
                onChange={() => setMode("full_scrub")}
                className="mt-1"
              />
              <span>
                <strong className="text-dark-red">Full scrub</strong>
                <span className="block text-slate mt-0.5">
                  Re-assigns every line in scope, including your manual edits.
                  Use when you want a clean AI pass — preview before applying.
                </span>
              </span>
            </label>
          </fieldset>

          {mode === "respect_manual" && (
            <label className="flex items-start gap-2 text-body-sm cursor-pointer">
              <input
                type="checkbox"
                checked={includeAiReviewed}
                onChange={(e) => setIncludeAiReviewed(e.target.checked)}
                className="mt-1 rounded"
              />
              <span>
                Also re-check uncertain AI-reviewed lines (still flagged or not
                high-confidence).
              </span>
            </label>
          )}

          <div className="rounded-md border border-border-muted bg-warm-sand/30 px-3 py-2 text-body-sm min-h-[2.5rem]">
            {loadingEligibility ? (
              <span className="inline-flex items-center gap-2 text-slate">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Estimating lines to review…
              </span>
            ) : summary ? (
              <p className="text-slate">{summary}</p>
            ) : (
              <p className="text-slate italic">Select a mode to see line counts.</p>
            )}
            {eligibility && eligibility.eligible_for_ai > 0 && (
              <p className="text-ink font-medium mt-1 tabular-nums">
                {eligibility.eligible_for_ai.toLocaleString()} line
                {eligibility.eligible_for_ai === 1 ? "" : "s"} in this run
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={busy || loadingEligibility || eligibility?.eligible_for_ai === 0}
            onClick={handleLaunch}
          >
            Preview changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
