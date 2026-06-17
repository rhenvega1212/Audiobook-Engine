"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SpeakerSelect,
  resolveLineSpeakerPayload,
  resolveSpeakerIdFromLine,
  type SpeakerCharacter,
} from "@/components/books/speaker-select";
import type { AiReviewProposal } from "@/lib/books/ai-review-proposals";
import { describeAiEligibility } from "@/lib/books/ai-review-eligibility";
import type { AiReviewEligibilityStats } from "@/lib/books/ai-review-eligibility";

export function AiReviewPreviewDialog({
  bookId,
  open,
  proposals,
  loading,
  progress = 0,
  progressMessage,
  eligibility,
  respectHumanReviewed = true,
  characters,
  onCharacterCreated,
  onOpenChange,
  onApplied,
}: {
  bookId: string;
  open: boolean;
  proposals: AiReviewProposal[];
  loading?: boolean;
  progress?: number;
  progressMessage?: string;
  eligibility?: AiReviewEligibilityStats | null;
  respectHumanReviewed?: boolean;
  characters: SpeakerCharacter[];
  onCharacterCreated?: (character: SpeakerCharacter) => void;
  onOpenChange: (open: boolean) => void;
  onApplied: (applied: number) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [chosenSpeakers, setChosenSpeakers] = useState<Record<string, string>>(
    {}
  );
  const [localCharacters, setLocalCharacters] = useState(characters);

  useEffect(() => {
    setLocalCharacters(characters);
  }, [characters]);

  const changed = useMemo(
    () => proposals.filter((p) => p.changed),
    [proposals]
  );

  const overrideCount = useMemo(
    () =>
      proposals.filter(
        (p) =>
          chosenSpeakers[p.line_id] !== undefined &&
          chosenSpeakers[p.line_id] !== p.new_speaker
      ).length,
    [proposals, chosenSpeakers]
  );

  useEffect(() => {
    if (open && proposals.length > 0) {
      setSelected(new Set(proposals.map((p) => p.line_id)));
      setChosenSpeakers(
        Object.fromEntries(proposals.map((p) => [p.line_id, p.new_speaker]))
      );
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

  const setSpeakerForLine = useCallback(
    (lineId: string, speakerId: string, hint?: SpeakerCharacter) => {
      const { speaker_label } = resolveLineSpeakerPayload(
        speakerId,
        localCharacters,
        undefined,
        hint
      );
      setChosenSpeakers((prev) => ({ ...prev, [lineId]: speaker_label }));
      setSelected((prev) => {
        const next = new Set(prev);
        next.add(lineId);
        return next;
      });
    },
    [localCharacters]
  );

  function handleCharacterCreated(character: SpeakerCharacter) {
    setLocalCharacters((prev) => {
      if (prev.some((c) => c.id === character.id)) return prev;
      return [...prev, character];
    });
    onCharacterCreated?.(character);
  }

  async function applySelected() {
    setSubmitting(true);
    try {
      const items = proposals.map((p) => {
        const chosen = chosenSpeakers[p.line_id] ?? p.new_speaker;
        const overridden = chosen !== p.new_speaker;
        return {
          line_id: p.line_id,
          speaker: chosen,
          confidence: overridden ? "high" : p.confidence,
          accept: selected.has(p.line_id),
        };
      });

      const res = await fetch(`/api/books/${bookId}/ai-review/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          create_snapshot: true,
          respect_human_reviewed: respectHumanReviewed,
        }),
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
                ? `${changed.length} speaker change${changed.length === 1 ? "" : "s"}. Use the dropdown to pick a different speaker if Claude got it wrong.`
                : "No speaker changes — Claude confirmed current assignments."}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="space-y-2 rounded-md border border-burgundy/20 bg-burgundy/5 px-4 py-3">
            <div className="flex items-center justify-between gap-2 text-body-sm">
              <span className="text-burgundy font-medium truncate flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                {progressMessage || "Gathering proposals…"}
              </span>
              <span className="text-slate tabular-nums shrink-0">{progress}%</span>
            </div>
            <Progress value={progress} active className="h-2.5" />
          </div>
        )}

        <div className="flex items-center justify-between gap-2 text-body-sm">
          <span className="text-slate">
            {selected.size} of {proposals.length} selected
            {overrideCount > 0 && (
              <span className="text-teal ml-1">
                · {overrideCount} adjusted by you
              </span>
            )}
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
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              {progressMessage || "Gathering proposals…"}
            </p>
          )}
          {!loading && proposals.length === 0 && (
            <div className="p-6 text-body-sm text-slate space-y-2">
              <p>
                Claude had no lines to review in this run — not necessarily a
                bug.
              </p>
              {eligibility ? (
                <p className="text-ink/90">{describeAiEligibility(eligibility)}</p>
              ) : (
                <p>
                  Try a different chapter, or enable re-check of uncertain
                  AI-reviewed lines in the setup dialog.
                </p>
              )}
              {eligibility && eligibility.flagged_count > 0 && (
                <ul className="list-disc pl-5 space-y-1 text-xs">
                  <li>
                    {eligibility.flagged_count.toLocaleString()} flagged in book
                  </li>
                  <li>
                    {eligibility.flagged_not_ai_reviewed.toLocaleString()} not
                    yet AI-reviewed
                  </li>
                  <li>
                    {eligibility.ai_reviewed_still_flagged.toLocaleString()}{" "}
                    AI-reviewed but still flagged
                  </li>
                  <li>
                    {eligibility.human_reviewed_flagged.toLocaleString()}{" "}
                    human-reviewed (skipped by AI)
                  </li>
                </ul>
              )}
            </div>
          )}
          {!loading &&
            proposals.map((p) => {
              const chosen = chosenSpeakers[p.line_id] ?? p.new_speaker;
              const overridden = chosen !== p.new_speaker;
              const speakerId = resolveSpeakerIdFromLine(
                chosen,
                null,
                localCharacters
              );

              return (
              <div
                key={p.line_id}
                className={`flex gap-3 p-3 hover:bg-warm-sand/50 ${
                  p.changed || overridden ? "" : "opacity-80"
                }`}
              >
                <input
                  id={`ai-proposal-${p.line_id}`}
                  type="checkbox"
                  className="mt-2 shrink-0 cursor-pointer"
                  checked={selected.has(p.line_id)}
                  onChange={() => toggle(p.line_id)}
                  aria-label={`Include line ${p.line_order + 1} in apply`}
                />
                <div className="text-body-sm break-words min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-slate">Line {p.line_order + 1}</span>
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 text-teal hover:text-teal/90 px-2 -mt-1"
                    >
                      <Link
                        href={`/books/${bookId}/manuscript?line=${encodeURIComponent(p.line_id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open this line in manuscript studio (new tab)"
                      >
                        <ExternalLink className="h-3.5 w-3.5 mr-1 shrink-0" />
                        <span className="hidden sm:inline">View in manuscript</span>
                        <span className="sm:hidden">View</span>
                      </Link>
                    </Button>
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {p.old_speaker !== chosen && (
                      <span className="text-xs text-slate line-through shrink-0">
                        {p.old_speaker}
                      </span>
                    )}
                    <SpeakerSelect
                      bookId={bookId}
                      value={speakerId}
                      characters={localCharacters}
                      onValueChange={(id, character) =>
                        setSpeakerForLine(p.line_id, id, character)
                      }
                      onCharacterCreated={handleCharacterCreated}
                      size="compact"
                      includeUnknown
                      className="w-[min(100%,13rem)]"
                      onTriggerClick={(e) => e.stopPropagation()}
                    />
                    {overridden ? (
                      <span className="text-xs text-teal shrink-0">
                        Claude: {p.new_speaker}
                      </span>
                    ) : (
                      p.changed && (
                        <span className="text-xs text-slate uppercase shrink-0">
                          {p.confidence}
                        </span>
                      )
                    )}
                    {!p.changed && !overridden && (
                      <span className="text-xs text-slate shrink-0">
                        confirmed · {p.confidence}
                      </span>
                    )}
                  </div>

                  <p className="mt-1.5 text-slate line-clamp-2">{p.line_text}</p>
                </div>
              </div>
            );
            })}
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
