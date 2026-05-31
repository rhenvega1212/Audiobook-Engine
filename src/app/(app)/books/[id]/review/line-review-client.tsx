"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  SpeakerSelect,
  resolveLineSpeakerPayload,
  resolveSpeakerIdFromLine,
  type SpeakerCharacter,
} from "@/components/books/speaker-select";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TaggedLine } from "@/lib/types/database";
import { useLineAudioPlayer } from "@/components/audio/line-player";
import { PerformLineRecorder } from "@/components/audio/perform-line-recorder";
import { resolveSpokenLine, type PronunciationEntry } from "@/lib/pronunciation/apply";
import { runBatchAiReview } from "@/lib/books/run-ai-review-client";
import { AcceptAiPreviewDialog } from "@/components/books/accept-ai-preview-dialog";
import {
  NARRATOR_VALUE,
  UNKNOWN_VALUE,
} from "@/lib/manuscript/speaker-utils";

function formatApiError(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const err = (data as { error?: unknown }).error;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") return fallback;
  return fallback;
}

function speakerLabelFromSelection(
  speakerId: string,
  characters: SpeakerCharacter[],
  hint?: SpeakerCharacter
): string {
  if (speakerId === NARRATOR_VALUE) return "Narrator";
  if (speakerId === UNKNOWN_VALUE) return "UNKNOWN";
  const char =
    characters.find((c) => c.id === speakerId) ??
    (hint?.id === speakerId ? hint : undefined);
  return char?.canonical_name ?? "";
}

export function LineReviewClient({
  bookId,
  bookTitle,
  allLines,
  flaggedLines,
  characters: initialCharacters,
  voiceBySpeaker,
  dictionary,
  initialReviewed,
}: {
  bookId: string;
  bookTitle: string;
  allLines: TaggedLine[];
  flaggedLines: TaggedLine[];
  characters: SpeakerCharacter[];
  voiceBySpeaker: Record<string, string | null>;
  dictionary: PronunciationEntry[];
  initialReviewed: number;
}) {
  const router = useRouter();
  const { playingId, loadingId, playLine } = useLineAudioPlayer();
  const [characters, setCharacters] = useState<SpeakerCharacter[]>(
    initialCharacters
  );

  useEffect(() => {
    setCharacters(initialCharacters);
  }, [initialCharacters]);

  const [lineRows, setLineRows] = useState(allLines);
  const saveSeqRef = useRef(0);

  const [queue, setQueue] = useState(
    flaggedLines.filter((l) => !l.human_reviewed)
  );
  const [history, setHistory] = useState<TaggedLine[]>([]);
  const [reviewed, setReviewed] = useState(initialReviewed);
  const [goingBack, setGoingBack] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [savingSpeaker, setSavingSpeaker] = useState(false);
  const [speakerId, setSpeakerId] = useState<string>("");
  const [speakerHint, setSpeakerHint] = useState<SpeakerCharacter | undefined>();
  const [spokenText, setSpokenText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReviewProgress, setAiReviewProgress] = useState(0);
  const [aiReviewMessage, setAiReviewMessage] = useState("");
  const [acceptAiOpen, setAcceptAiOpen] = useState(false);

  const currentFromQueue = queue[0];
  const current = currentFromQueue
    ? (lineRows.find((l) => l.id === currentFromQueue.id) ?? currentFromQueue)
    : undefined;
  const total = flaggedLines.length;
  const progress = total > 0 ? (reviewed / total) * 100 : 100;

  const currentIndex = current
    ? lineRows.findIndex((l) => l.id === current.id)
    : -1;

  const contextBefore = lineRows.slice(
    Math.max(0, currentIndex - 3),
    currentIndex
  );
  const contextAfter = lineRows.slice(currentIndex + 1, currentIndex + 4);

  useEffect(() => {
    if (current) {
      setSpeakerId(
        resolveSpeakerIdFromLine(
          current.speaker_label,
          current.speaker_character_id,
          characters
        )
      );
      setSpokenText(current.spoken_text ?? "");
    }
  }, [current, characters]);

  const advance = useCallback(() => {
    setQueue((q) => {
      if (q.length === 0) return q;
      const [first, ...rest] = q;
      setHistory((h) => [...h, first]);
      return rest;
    });
    setReviewed((r) => r + 1);
  }, []);

  async function goBack() {
    const prev = history[history.length - 1];
    if (!prev) return;
    setGoingBack(true);
    const res = await fetch(`/api/books/${bookId}/lines/${prev.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ human_reviewed: false }),
    });
    setGoingBack(false);
    if (!res.ok) {
      toast.error("Could not go back to previous line");
      return;
    }
    patchLineRow(prev.id, { human_reviewed: false });
    setHistory((h) => h.slice(0, -1));
    setQueue((q) => [
      lineRows.find((l) => l.id === prev.id) ?? prev,
      ...q,
    ]);
    setReviewed((r) => Math.max(0, r - 1));
  }

  function patchLineRow(lineId: string, patch: Partial<TaggedLine>) {
    setLineRows((rows) =>
      rows.map((l) => (l.id === lineId ? { ...l, ...patch } : l))
    );
  }

  const effectiveSpeakerId =
    speakerId ||
    (current
      ? resolveSpeakerIdFromLine(
          current.speaker_label,
          current.speaker_character_id,
          characters
        )
      : "");

  async function persistLine(
    line: TaggedLine,
    body: Record<string, unknown>
  ): Promise<TaggedLine | null> {
    const res = await fetch(`/api/books/${bookId}/lines/${line.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(formatApiError(data, "Could not save line"));
      return null;
    }
    const { book_status: _status, ...saved } = data as TaggedLine & {
      book_status?: string;
    };
    return saved as TaggedLine;
  }

  async function saveSpeakerSelection(
    line: TaggedLine,
    nextSpeakerId: string,
    hint?: SpeakerCharacter
  ) {
    const id =
      nextSpeakerId ||
      resolveSpeakerIdFromLine(
        line.speaker_label,
        line.speaker_character_id,
        characters
      );
    const speaker = resolveLineSpeakerPayload(
      id,
      characters,
      line.speaker_label,
      hint
    );
    const seq = ++saveSeqRef.current;
    setSavingSpeaker(true);
    const saved = await persistLine(line, {
      ...speaker,
      human_reviewed: false,
    });
    setSavingSpeaker(false);
    if (!saved || seq !== saveSeqRef.current) return null;
    patchLineRow(line.id, saved);
    return saved;
  }

  async function confirmLine() {
    if (!current || confirming) return;
    setConfirming(true);
    try {
      const speaker = resolveLineSpeakerPayload(
        effectiveSpeakerId,
        characters,
        current.speaker_label,
        speakerHint
      );
      const saved = await persistLine(current, {
        ...speaker,
        spoken_text: spokenText.trim() || null,
        human_reviewed: true,
        flag_reason: null,
      });
      if (!saved) return;

      patchLineRow(current.id, saved);
      setQueue((q) => {
        if (q.length === 0) return q;
        const [, ...rest] = q;
        setHistory((h) => [...h, { ...current, ...saved }]);
        return rest;
      });
      setReviewed((r) => r + 1);
      toast.success("Saved");
    } finally {
      setConfirming(false);
    }
  }

  async function skipLine() {
    if (!current || confirming) return;
    setConfirming(true);
    try {
      const saved = await persistLine(current, { human_reviewed: true });
      if (!saved) return;
      patchLineRow(current.id, saved);
      advance();
    } finally {
      setConfirming(false);
    }
  }

  async function aiSuggestion() {
    if (!current) return;
    setAiLoading(true);
    setAiReviewProgress(3);
    setAiReviewMessage("Starting AI review…");
    const pendingFlagged = queue.length;
    try {
      const result = await runBatchAiReview(
        bookId,
        ({ message, progress }) => {
          setAiReviewMessage(message);
          setAiReviewProgress(progress);
        },
        pendingFlagged
      );
      setAiReviewProgress(100);
      setAiReviewMessage("AI review complete");
      router.refresh();
      const humanLeft = result.pending_human_review ?? 0;
      toast.success(
        humanLeft > 0
          ? `AI review complete — cleared ${result.lines_cleared} flags, ${humanLeft} line${humanLeft === 1 ? "" : "s"} still need your review`
          : `AI review complete — updated ${result.lines_updated} lines, cleared ${result.lines_cleared} flags`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI suggestion failed");
      router.refresh();
    } finally {
      setAiLoading(false);
    }
  }

  function onAcceptAiDone(count: number) {
    toast.success(`Accepted ${count} AI-confirmed line${count === 1 ? "" : "s"}`);
    router.refresh();
  }

  async function markAllConfirmed() {
    for (const line of queue) {
      await fetch(`/api/books/${bookId}/lines/${line.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ human_reviewed: true }),
      });
    }
    setQueue([]);
    setReviewed(total);
    toast.success("All marked as confirmed");
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      if (confirming) return;
      if (e.key === "Enter") {
        e.preventDefault();
        void confirmLine();
      } else if (e.key === "s" || e.key === "S") {
        void skipLine();
      } else if (e.key === "a" || e.key === "A") {
        aiSuggestion();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const selectedSpeakerLabel =
    speakerLabelFromSelection(effectiveSpeakerId, characters, speakerHint) ||
    current?.speaker_label ||
    "";

  const currentSpoken = current
    ? resolveSpokenLine(current.line_text, current.spoken_text, dictionary)
    : "";
  const currentVoiceId =
    characters.find((c) => c.id === speakerId)?.elevenlabs_voice_id ??
    voiceBySpeaker[current?.speaker_label ?? ""] ??
    null;

  const currentVoiceName =
    characters.find((c) => c.id === speakerId)?.elevenlabs_voice_name ??
    characters.find((c) => c.canonical_name === current?.speaker_label)
      ?.elevenlabs_voice_name ??
    null;

  if (!current) {
    return (
      <div className="mx-auto max-w-xl text-center py-16">
        <p className="font-serif text-h2">Review complete</p>
        <p className="mt-2 text-slate">All flagged lines have been reviewed.</p>
        <Button asChild className="mt-6">
          <Link href={`/books/${bookId}`}>Back to book</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[720px]">
      <div className="mb-6">
        <Link
          href={`/books/${bookId}`}
          className="text-body-sm text-teal hover:underline"
        >
          ← {bookTitle}
        </Link>
        <p className="mt-4 text-xs font-medium uppercase tracking-wider text-slate">
          {reviewed} of {total} reviewed
        </p>
        <Progress value={progress} className="mt-2" />
      </div>

      {aiLoading && (
        <div className="mb-6 rounded-lg border border-burgundy/30 bg-burgundy/5 px-4 py-4 space-y-3">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-burgundy shrink-0" />
            <p className="font-serif italic text-burgundy flex-1">
              {aiReviewMessage || "Running AI review…"}
            </p>
            <span className="text-body-sm text-slate tabular-nums shrink-0">
              {aiReviewProgress}%
            </span>
          </div>
          <Progress value={aiReviewProgress} className="h-2" />
          <p className="text-body-sm text-slate">
            Reviewing flagged lines in batches — this may take a few minutes.
          </p>
        </div>
      )}

      <div className="space-y-2 mb-4">
        {contextBefore.map((l) => (
          <p key={l.id} className="text-body-sm text-slate/90 pl-2 break-words">
            <span className="font-medium">{l.speaker_label}:</span>{" "}
            {l.line_text}
          </p>
        ))}
      </div>

      <Card className="border-l-4 border-l-teal p-4 mb-4">
        <p className="text-xs uppercase tracking-wider text-slate mb-2">
          Current: {selectedSpeakerLabel}
          {savingSpeaker && (
            <span className="ml-2 normal-case text-teal">Saving…</span>
          )}
          {current.flag_reason && (
            <span className="ml-2 normal-case">({current.flag_reason})</span>
          )}
        </p>
        <p className="font-serif text-base break-words">{current.line_text}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!currentVoiceId || loadingId !== null}
            onClick={() =>
              playLine(current.id, currentVoiceId ?? "", currentSpoken)
            }
          >
            {loadingId === current.id ? "Generating…" : playingId === current.id ? "Playing…" : "Listen to line"}
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link
              href={`/books/${bookId}/manuscript?line=${encodeURIComponent(current.id)}`}
            >
              Open in manuscript studio
            </Link>
          </Button>
        </div>
        {currentVoiceId && (
          <div className="mt-4">
            <PerformLineRecorder
              lineId={current.id}
              voiceId={currentVoiceId}
              voiceName={currentVoiceName}
              spokenText={currentSpoken}
              compact
            />
          </div>
        )}
      </Card>

      <div className="space-y-2 mb-6">
        {contextAfter.map((l) => (
          <p key={l.id} className="text-body-sm text-slate/90 pl-2 break-words">
            <span className="font-medium">{l.speaker_label}:</span>{" "}
            {l.line_text}
          </p>
        ))}
      </div>

      <div className="mb-4">
        <Label htmlFor="spoken-override">Spoken line (pronunciation override)</Label>
        <Input
          id="spoken-override"
          className="mt-1 mb-4"
          value={spokenText}
          onChange={(e) => setSpokenText(e.target.value)}
          placeholder="Optional — how this line should be read on export"
        />
        <label className="text-xs font-medium uppercase tracking-wider text-slate">
          Speaker
        </label>
        <SpeakerSelect
          className="mt-1"
          bookId={bookId}
          includeUnknown
          value={speakerId}
          onValueChange={(id, character) => {
            setSpeakerId(id);
            setSpeakerHint(character);
            if (current) {
              void saveSpeakerSelection(current, id, character);
            }
          }}
          characters={characters}
          onCharacterCreated={(c) => {
            setCharacters((prev) => {
              if (prev.some((x) => x.id === c.id)) return prev;
              return [...prev, c];
            });
            setSpeakerHint(c);
            setSpeakerId(c.id);
            if (current) {
              void saveSpeakerSelection(current, c.id, c);
            }
          }}
        />
      </div>

      <div className="mb-6 rounded-md border border-border-muted bg-warm-sand/40 px-4 py-3 text-body-sm text-slate">
        <p>
          <strong className="text-ink">This screen</strong> is for confirming
          who speaks each flagged line — not for listening to the full audiobook.
        </p>
        <p className="mt-2">
          For full-book editing (split lines, delete sections, cast voices), use{" "}
          <Link
            href={`/books/${bookId}/manuscript?line=${encodeURIComponent(current.id)}`}
            className="text-teal hover:underline"
          >
            Manuscript studio
          </Link>
          . For pronunciation,{" "}
          <Link href={`/books/${bookId}/pronunciation`} className="text-teal hover:underline">
            Pronunciation & proofread
          </Link>
          . To listen through the book,{" "}
          <Link href={`/books/${bookId}/listen`} className="text-teal hover:underline">
            Listen
          </Link>
          .
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={goBack}
          disabled={history.length === 0 || goingBack}
        >
          Go back
        </Button>
        <Button onClick={() => void confirmLine()} disabled={confirming || savingSpeaker}>
          {confirming ? "Saving…" : "Confirm (Enter)"}
        </Button>
        <Button variant="ghost" onClick={() => void skipLine()} disabled={confirming}>
          Skip (S)
        </Button>
        <Button
          variant="secondary"
          onClick={aiSuggestion}
          disabled={aiLoading}
        >
          {aiLoading ? "Running AI review…" : "AI batch review (A)"}
        </Button>
        <Button asChild variant="secondary">
          <Link href={`/books/${bookId}/manuscript?flagged=1`}>
            All flagged in studio
          </Link>
        </Button>
      </div>

      <div className="mt-8 space-y-2">
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => setAcceptAiOpen(true)}
        >
          Preview & accept AI suggestions…
        </Button>
        <AcceptAiPreviewDialog
          bookId={bookId}
          open={acceptAiOpen}
          onOpenChange={setAcceptAiOpen}
          onAccepted={onAcceptAiDone}
        />
        <Button
          variant="outline"
          className="w-full"
          onClick={markAllConfirmed}
        >
          Mark all unreviewed as confirmed
        </Button>
      </div>
    </div>
  );
}
