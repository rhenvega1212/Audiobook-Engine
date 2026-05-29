"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AcceptAiCandidate } from "@/lib/books/accept-ai-lines";

export function AcceptAiPreviewDialog({
  bookId,
  open,
  onOpenChange,
  onAccepted,
}: {
  bookId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccepted: (count: number) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [candidates, setCandidates] = useState<AcceptAiCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/books/${bookId}/lines/accept-ai/preview`)
      .then((r) => r.json())
      .then((data) => {
        const list = (data as { candidates?: AcceptAiCandidate[] }).candidates ?? [];
        setCandidates(list);
        setSelected(new Set(list.map((c) => c.id)));
      })
      .finally(() => setLoading(false));
  }, [open, bookId]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function acceptSelected() {
    setSubmitting(true);
    const res = await fetch(`/api/books/${bookId}/lines/accept-ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ line_ids: [...selected] }),
    });
    setSubmitting(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((data as { error?: string }).error ?? "Accept failed");
    }
    onAccepted((data as { accepted?: number }).accepted ?? 0);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Accept AI suggestions</DialogTitle>
          <DialogDescription>
            These flagged lines were reviewed by AI with medium or high confidence.
            Uncheck any you want to keep in the review queue.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 border rounded-md divide-y">
          {loading && (
            <p className="p-4 text-body-sm text-slate flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          )}
          {!loading && candidates.length === 0 && (
            <p className="p-4 text-body-sm text-slate">
              No AI-confirmed lines ready to accept. Run AI batch review first.
            </p>
          )}
          {!loading &&
            candidates.map((c) => (
              <label
                key={c.id}
                className="flex gap-3 p-3 cursor-pointer hover:bg-warm-sand/50"
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
                />
                <span className="text-body-sm break-words">
                  <span className="font-medium">{c.speaker_label}</span>
                  <span className="text-slate ml-1">#{c.line_order + 1}</span>
                  <span className="block mt-1">{c.line_text}</span>
                  {c.flag_reason && (
                    <span className="block mt-1 text-xs text-slate">
                      {c.flag_reason}
                    </span>
                  )}
                </span>
              </label>
            ))}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={submitting || selected.size === 0}
            onClick={() =>
              acceptSelected().catch((e) =>
                toast.error(e instanceof Error ? e.message : "Accept failed")
              )
            }
          >
            {submitting
              ? "Accepting…"
              : `Accept ${selected.size} line${selected.size === 1 ? "" : "s"}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
