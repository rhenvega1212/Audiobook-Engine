"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AiReviewProposal } from "@/lib/books/ai-review-proposals";

export function AiReviewPreviewDialog({
  bookId,
  open,
  proposals,
  loading,
  progress = 0,
  progressMessage,
  onOpenChange,
  onApplied,
}: {
  bookId: string;
  open: boolean;
  proposals: AiReviewProposal[];
  loading?: boolean;
  progress?: number;
  progressMessage?: string;
  onOpenChange: (open: boolean) => void;
  onApplied: (applied: number) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const changed = useMemo(
    () => proposals.filter((p) => p.changed),
    [proposals]
  );

  useEffect(() => {
    if (open && proposals.length > 0) {
      setSelected(new Set(proposals.map((p) => p.line_id)));
    }
  }, [open, proposals]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll(on: boolean) {
    setSelected(on ? new Set(proposals.map((p) => p.line_id)) : new Set());
  }

  async function applySelected() {
    setSubmitting(true);
    try {
      const items = proposals.map((p) => ({
        line_id: p.line_id,
        speaker: p.new_speaker,
        confidence: p.confidence,
        accept: selected.has(p.line_id),
      }));

      const res = await fetch(`/api/books/${bookId}/ai-review/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, create_snapshot: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "Apply failed");
      }
      onApplied((data as { applied?: number }).applied ?? 0);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {loading
              ? "Claude is reviewing…"
              : `Claude suggests ${proposals.length} update${proposals.length === 1 ? "" : "s"}`}
          </DialogTitle>
          <DialogDescription>
            {loading
              ? progressMessage ||
                "Reading scenes from your Word file. This may take a minute."
              : changed.length > 0
                ? `${changed.length} speaker change${changed.length === 1 ? "" : "s"}. Uncheck any you disagree with before applying.`
                : "No speaker changes — Claude confirmed current assignments."}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="space-y-2 rounded-md border border-burgundy/20 bg-burgundy/5 px-4 py-3">
            <div className="flex items-center justify-between gap-2 text-body-sm">
              <span className="text-burgundy font-medium truncate">
                {progressMessage || "Gathering proposals…"}
              </span>
              <span className="text-slate tabular-nums shrink-0">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        <div className="flex items-center justify-between gap-2 text-body-sm">
          <span className="text-slate">
            {selected.size} of {proposals.length} selected
          </span>
          {!loading && proposals.length > 0 && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => selectAll(true)}
              >
                Select all
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => selectAll(false)}
              >
                Select none
              </Button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 border rounded-md divide-y">
          {loading && (
            <p className="p-6 text-body-sm text-slate flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Gathering proposals…
            </p>
          )}
          {!loading && proposals.length === 0 && (
            <p className="p-6 text-body-sm text-slate">
              No lines matched your scope and filters. Try a different chapter or
              enable re-check of uncertain AI-reviewed lines.
            </p>
          )}
          {!loading &&
            proposals.map((p) => (
              <label
                key={p.line_id}
                className={`flex gap-3 p-3 cursor-pointer hover:bg-warm-sand/50 ${
                  p.changed ? "" : "opacity-80"
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1 shrink-0"
                  checked={selected.has(p.line_id)}
                  onChange={() => toggle(p.line_id)}
                />
                <span className="text-body-sm break-words min-w-0">
                  <span className="text-slate">Line {p.line_order + 1}</span>
                  {p.changed ? (
                    <span className="block mt-0.5">
                      <span className="line-through text-slate">{p.old_speaker}</span>
                      <span className="mx-2 text-teal">→</span>
                      <span className="font-medium text-ink">{p.new_speaker}</span>
                      <span className="ml-2 text-xs text-slate uppercase">
                        {p.confidence}
                      </span>
                    </span>
                  ) : (
                    <span className="block mt-0.5 font-medium">
                      {p.new_speaker}
                      <span className="ml-2 text-xs text-slate font-normal">
                        confirmed · {p.confidence}
                      </span>
                    </span>
                  )}
                  <span className="block mt-1 text-slate line-clamp-2">
                    {p.line_text}
                  </span>
                </span>
              </label>
            ))}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={submitting || loading || selected.size === 0}
            onClick={() =>
              applySelected().catch((e) =>
                toast.error(e instanceof Error ? e.message : "Apply failed")
              )
            }
          >
            {submitting
              ? "Applying…"
              : `Apply ${selected.size} change${selected.size === 1 ? "" : "s"}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
