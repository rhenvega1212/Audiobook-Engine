"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SpeakerSelect,
  resolveSpeakerIdFromLine,
  resolveLineSpeakerPayload,
  type SpeakerCharacter,
} from "@/components/books/speaker-select";
import type { Character } from "@/lib/types/database";

type ContextLine = {
  id: string;
  line_order: number;
  speaker_label: string;
  line_text: string;
  flag_reason: string | null;
  speaker_character_id?: string | null;
};

type FlaggedLineRef = {
  id: string;
  line_order: number;
  speaker_label: string;
};

export function ReadClient({
  bookId,
  bookTitle,
  lineId,
  characters,
}: {
  bookId: string;
  bookTitle: string;
  lineId: string;
  characters: Pick<Character, "id" | "canonical_name" | "aliases">[];
}) {
  const router = useRouter();
  const [roster, setRoster] = useState(characters as SpeakerCharacter[]);
  const [lines, setLines] = useState<ContextLine[]>([]);

  useEffect(() => {
    setRoster(characters as SpeakerCharacter[]);
  }, [characters]);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flaggedLines, setFlaggedLines] = useState<FlaggedLineRef[]>([]);
  const [savingLineId, setSavingLineId] = useState<string | null>(null);
  const targetRef = useRef<HTMLDivElement>(null);

  const flaggedIndex = flaggedLines.findIndex((l) => l.id === lineId);
  const prevFlagged = flaggedIndex > 0 ? flaggedLines[flaggedIndex - 1] : null;
  const nextFlagged =
    flaggedIndex >= 0 && flaggedIndex < flaggedLines.length - 1
      ? flaggedLines[flaggedIndex + 1]
      : null;

  const loadContext = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/books/${bookId}/lines/context?line_id=${encodeURIComponent(lineId)}&before=25&after=25`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ?? "Failed to load context"
        );
      }
      setLines((data as { lines?: ContextLine[] }).lines ?? []);
      setTargetId((data as { target_id?: string }).target_id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load context");
    } finally {
      setLoading(false);
    }
  }, [bookId, lineId]);

  useEffect(() => {
    loadContext();
  }, [loadContext]);

  useEffect(() => {
    fetch(`/api/books/${bookId}/lines/flagged`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setFlaggedLines((data as { lines?: FlaggedLineRef[] }).lines ?? []);
        }
      })
      .catch(() => {});
  }, [bookId, lineId]);

  useEffect(() => {
    if (!loading && targetRef.current) {
      targetRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [loading, targetId, lineId]);

  async function updateLine(
    line: ContextLine,
    value: string,
    options?: { clearFlag?: boolean },
    hint?: SpeakerCharacter
  ) {
    const { speaker_label, speaker_character_id } = resolveLineSpeakerPayload(
      value,
      roster,
      line.speaker_label,
      hint
    );
    setSavingLineId(line.id);

    try {
      const res = await fetch(`/api/books/${bookId}/lines/${line.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          speaker_label,
          speaker_character_id,
          ...(options?.clearFlag
            ? { flag_reason: null, human_reviewed: true }
            : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Save failed");
      }

      setLines((prev) =>
        prev.map((l) =>
          l.id === line.id
            ? {
                ...l,
                speaker_label,
                speaker_character_id,
                flag_reason: options?.clearFlag ? null : l.flag_reason,
              }
            : l
        )
      );

      if (options?.clearFlag) {
        setFlaggedLines((prev) => prev.filter((l) => l.id !== line.id));
        toast.success("Flag cleared");
      } else {
        toast.success("Speaker updated");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingLineId(null);
    }
  }

  function goToFlagged(id: string) {
    router.push(`/books/${bookId}/read?line=${encodeURIComponent(id)}`);
  }

  return (
    <div>
      <Link
        href={`/books/${bookId}`}
        className="text-body-sm text-teal hover:underline"
      >
        ← {bookTitle}
      </Link>

      <h1 className="font-serif text-h1 mt-4">Manuscript context</h1>
      <p className="mt-2 text-body-sm text-slate max-w-2xl">
        Change who speaks each line, or jump between flagged lines. Context
        shows lines before and after your selection.{" "}
        <Link
          href={`/books/${bookId}/manuscript?line=${encodeURIComponent(lineId)}`}
          className="text-teal hover:underline"
        >
          Open full manuscript studio →
        </Link>
      </p>

      {flaggedLines.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3">
          <span className="text-body-sm text-ink font-medium">
            {flaggedLines.length.toLocaleString()} flagged line
            {flaggedLines.length === 1 ? "" : "s"}
          </span>
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <Button
              size="sm"
              variant="secondary"
              disabled={!prevFlagged}
              onClick={() => prevFlagged && goToFlagged(prevFlagged.id)}
            >
              <ChevronLeft className="h-4 w-4 mr-0.5" />
              Prev flagged
            </Button>
            {flaggedIndex >= 0 && (
              <span className="text-body-sm text-slate tabular-nums px-1">
                {flaggedIndex + 1} / {flaggedLines.length}
              </span>
            )}
            <Button
              size="sm"
              variant="secondary"
              disabled={!nextFlagged}
              onClick={() => nextFlagged && goToFlagged(nextFlagged.id)}
            >
              Next flagged
              <ChevronRight className="h-4 w-4 ml-0.5" />
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/books/${bookId}/review`}>Review queue</Link>
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : error ? (
        <p className="py-16 text-center text-body-sm text-slate">{error}</p>
      ) : (
        <div className="mt-8 space-y-2 max-w-3xl">
          {lines.map((line) => {
            const isTarget = line.id === targetId;
            const isFlagged = !!line.flag_reason;
            const speakerValue = resolveSpeakerIdFromLine(
              line.speaker_label,
              line.speaker_character_id,
              roster
            );
            const isSaving = savingLineId === line.id;

            return (
              <div
                key={line.id}
                ref={isTarget ? targetRef : undefined}
                className={`rounded-md px-4 py-3 transition-colors ${
                  isTarget
                    ? "bg-teal/10 border-l-4 border-l-teal shadow-sm"
                    : isFlagged
                      ? "bg-warning/5 border-l-4 border-l-warning/50"
                      : "bg-warm-sand/30 border-l-4 border-l-transparent"
                }`}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-2">
                  <p className="text-[11px] uppercase tracking-wider text-slate shrink-0">
                    Line {line.line_order.toLocaleString()}
                    {isTarget && (
                      <span className="ml-2 normal-case text-teal font-medium">
                        — selected
                      </span>
                    )}
                    {isFlagged && (
                      <span className="ml-2 normal-case text-warning">
                        · flagged
                      </span>
                    )}
                  </p>

                  <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                    <SpeakerSelect
                      bookId={bookId}
                      size="compact"
                      includeUnknown
                      className="max-w-[220px]"
                      value={speakerValue}
                      characters={roster}
                      disabled={isSaving}
                      onCharacterCreated={(c) => {
                        setRoster((prev) => {
                          if (prev.some((x) => x.id === c.id)) return prev;
                          return [...prev, c];
                        });
                        router.refresh();
                      }}
                      onValueChange={(value, character) =>
                        updateLine(line, value, undefined, character)
                      }
                    />

                    {isFlagged && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 text-xs"
                        disabled={isSaving}
                        onClick={() =>
                          updateLine(line, speakerValue, { clearFlag: true })
                        }
                      >
                        Clear flag
                      </Button>
                    )}
                    {isSaving && (
                      <Loader2 className="h-4 w-4 animate-spin text-slate" />
                    )}
                  </div>
                </div>

                <p className="font-serif text-sm text-ink whitespace-pre-wrap break-words">
                  {line.line_text}
                </p>

                {isFlagged && line.flag_reason && (
                  <p className="mt-2 text-[11px] text-slate italic">
                    {line.flag_reason}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-8 flex flex-wrap gap-4">
        <Link
          href={`/books/${bookId}/listen?line=${encodeURIComponent(lineId)}`}
          className="text-body-sm text-teal hover:underline"
        >
          Listen from this line →
        </Link>
        {flaggedLines.length > 0 && (
          <Link
            href={`/books/${bookId}/read?line=${encodeURIComponent(flaggedLines[0]?.id ?? lineId)}`}
            className="text-body-sm text-teal hover:underline"
          >
            Jump to first flagged line
          </Link>
        )}
      </div>
    </div>
  );
}
