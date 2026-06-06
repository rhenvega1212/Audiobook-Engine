"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Loader2,
  Pause,
  Play,
  SkipForward,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { PerformLineRecorder } from "@/components/audio/perform-line-recorder";
import { CompactSpeakerBlock } from "@/components/manuscript/compact-speaker-block";
import { groupConsecutiveSpeakerBlocks } from "@/lib/manuscript/group-lines";

type ListenLine = {
  id: string;
  line_order: number;
  speaker_label: string;
  line_text: string;
  spoken_text: string;
  voice_id: string | null;
  voice_name: string | null;
  voice_playback?: {
    language_code?: string;
    voice_settings?: import("@/lib/elevenlabs/voice-settings").VoiceSettings;
  } | null;
  excluded_from_export: boolean;
};

export function ListenClient({
  bookId,
  bookTitle,
  lines,
  speakers,
  castCount,
  totalCount,
  excludedCount,
  initialSpeaker,
  initialLineId,
}: {
  bookId: string;
  bookTitle: string;
  lines: ListenLine[];
  speakers: string[];
  castCount: number;
  totalCount: number;
  excludedCount: number;
  initialSpeaker?: string;
  initialLineId?: string;
}) {
  const [search, setSearch] = useState("");
  const [speakerFilter, setSpeakerFilter] = useState(
    initialLineId
      ? "all"
      : initialSpeaker && speakers.includes(initialSpeaker)
        ? initialSpeaker
        : "all"
  );
  const [showExcluded, setShowExcluded] = useState(false);
  const [compactView, setCompactView] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const lineButtonRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [playAll, setPlayAll] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playAllRef = useRef(false);

  const filtered = useMemo(() => {
    let result = lines;
    if (!showExcluded) {
      result = result.filter((l) => !l.excluded_from_export);
    }
    if (speakerFilter !== "all") {
      result = result.filter((l) => l.speaker_label === speakerFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.line_text.toLowerCase().includes(q) ||
          l.speaker_label.toLowerCase().includes(q)
      );
    }
    return result;
  }, [lines, speakerFilter, search, showExcluded]);

  const blocks = useMemo(
    () => groupConsecutiveSpeakerBlocks(filtered),
    [filtered]
  );

  const items = compactView ? blocks : filtered;

  useEffect(() => {
    if (!initialLineId) return;
    if (compactView) {
      const blockIdx = blocks.findIndex((b) =>
        b.line_ids.includes(initialLineId)
      );
      if (blockIdx >= 0) setCurrentIndex(blockIdx);
    } else {
      const idx = filtered.findIndex((l) => l.id === initialLineId);
      if (idx >= 0) setCurrentIndex(idx);
    }
  }, [initialLineId, filtered, blocks, compactView]);

  useEffect(() => {
    setCurrentIndex(0);
  }, [speakerFilter, search, showExcluded, compactView]);

  useEffect(() => {
    lineButtonRefs.current.get(currentIndex)?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [currentIndex, compactView]);

  const currentLine = compactView
    ? (blocks[currentIndex]?.lines[0] ?? filtered[0])
    : (filtered[currentIndex] ?? filtered[0]);

  const currentBlock = compactView ? blocks[currentIndex] : null;

  const displayText = compactView && currentBlock
    ? currentBlock.combined_text
    : currentLine?.line_text ?? "";

  const displaySpoken =
    compactView && currentBlock
      ? currentBlock.lines.map((l) => l.spoken_text).join("\n")
      : currentLine?.spoken_text ?? "";

  function stop() {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(false);
    setPlayAll(false);
    playAllRef.current = false;
  }

  async function playText(
    lineId: string,
    voiceId: string | null,
    text: string,
    speakerLabel: string,
    playback?: ListenLine["voice_playback"]
  ): Promise<boolean> {
    if (!voiceId) {
      toast.error(`No voice cast for ${speakerLabel}`);
      return false;
    }
    if (!text.trim()) {
      toast.error("Line is empty");
      return false;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/voices/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voice_id: voiceId,
          text: text.slice(0, 2500),
          ...(playback?.language_code
            ? { language_code: playback.language_code }
            : {}),
          ...(playback?.voice_settings
            ? { voice_settings: playback.voice_settings }
            : {}),
        }),
      });
      if (!res.ok) throw new Error("Playback failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      return await new Promise((resolve) => {
        audioRef.current?.pause();
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          setPlaying(false);
          URL.revokeObjectURL(url);
          resolve(true);
        };
        audio.onerror = () => {
          setPlaying(false);
          URL.revokeObjectURL(url);
          resolve(false);
        };
        setPlaying(true);
        audio.play().catch(() => resolve(false));
      });
    } catch {
      toast.error("Could not play line");
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function playAt(index: number): Promise<boolean> {
    if (compactView) {
      const block = blocks[index];
      if (!block) return false;
      const voiceLine = block.lines.find((l) => l.voice_id) ?? block.lines[0];
      return playText(
        voiceLine.id,
        voiceLine.voice_id,
        block.lines.map((l) => l.spoken_text).join("\n"),
        block.speaker_label,
        voiceLine.voice_playback
      );
    }
    const line = filtered[index];
    if (!line) return false;
    setCurrentIndex(index);
    return playText(
      line.id,
      line.voice_id,
      line.spoken_text,
      line.speaker_label,
      line.voice_playback
    );
  }

  async function handlePlayLine(index = currentIndex) {
    stop();
    setCurrentIndex(index);
    await playAt(index);
  }

  async function handlePlayAll(fromIndex = currentIndex) {
    stop();
    setPlayAll(true);
    playAllRef.current = true;

    for (let i = fromIndex; i < items.length; i++) {
      if (!playAllRef.current) break;
      setCurrentIndex(i);
      const ok = await playAt(i);
      if (!ok && playAllRef.current) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    setPlayAll(false);
    playAllRef.current = false;
  }

  function skipNext() {
    const next = Math.min(currentIndex + 1, items.length - 1);
    setCurrentIndex(next);
    if (playing || playAll) handlePlayLine(next);
  }

  const playableCount = filtered.filter((l) => l.voice_id).length;

  return (
    <div>
      <Link
        href={`/books/${bookId}`}
        className="text-body-sm text-teal hover:underline"
      >
        ← {bookTitle}
      </Link>

      <h1 className="font-serif text-h1 mt-4">Listen</h1>
      <p className="mt-2 text-body-sm text-slate max-w-2xl">
        Hear lines spoken with cast voices. {playableCount.toLocaleString()} of{" "}
        {filtered.length.toLocaleString()} audible lines have voices.
        {excludedCount > 0 && !showExcluded && (
          <>
            {" "}
            {excludedCount.toLocaleString()} skipped-from-export lines hidden —{" "}
            <button
              type="button"
              className="text-teal hover:underline"
              onClick={() => setShowExcluded(true)}
            >
              show them
            </button>
            .
          </>
        )}
        {playableCount < filtered.length && (
          <>
            {" "}
            <Link href={`/books/${bookId}/manuscript`} className="text-teal hover:underline">
              Cast in manuscript studio
            </Link>
            .
          </>
        )}
      </p>

      <div className="mt-6 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <Label htmlFor="listen-search">Search lines</Label>
          <Input
            id="listen-search"
            className="mt-1"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search text or speaker…"
          />
        </div>
        <div>
          <Label>Speaker</Label>
          <Select value={speakerFilter} onValueChange={setSpeakerFilter}>
            <SelectTrigger className="w-44 mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All speakers</SelectItem>
              {speakers.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-body-sm">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showExcluded}
            onChange={(e) => setShowExcluded(e.target.checked)}
            className="rounded"
          />
          Show excluded lines
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={compactView}
            onChange={(e) => setCompactView(e.target.checked)}
            className="rounded"
          />
          Compact view (group same speaker)
        </label>
        <Button asChild variant="outline" size="sm">
          <Link href={`/books/${bookId}/manuscript`}>Edit in manuscript studio</Link>
        </Button>
      </div>

      {currentLine && (
        <Card className="mt-6 p-4 border-l-4 border-l-teal">
          {compactView && currentBlock ? (
            <p className="text-xs uppercase tracking-wider text-slate mb-2">
              Lines {currentBlock.first_line_order.toLocaleString()}–
              {currentBlock.last_line_order.toLocaleString()} ·{" "}
              {currentBlock.speaker_label}
              {currentLine.voice_name && (
                <span className="ml-2 normal-case">({currentLine.voice_name})</span>
              )}
            </p>
          ) : (
            <p className="text-xs uppercase tracking-wider text-slate mb-2">
              Line {currentLine.line_order.toLocaleString()} ·{" "}
              {currentLine.speaker_label}
              {currentLine.voice_name && (
                <span className="ml-2 normal-case">({currentLine.voice_name})</span>
              )}
              {currentLine.excluded_from_export && (
                <span className="ml-2 text-slate normal-case">(skipped in export)</span>
              )}
            </p>
          )}
          <p className="font-serif text-base break-words mb-4 whitespace-pre-wrap">
            {displayText}
          </p>
          {displaySpoken !== displayText && (
            <p className="text-body-sm text-teal mb-4 break-words whitespace-pre-wrap">
              Spoken as: {displaySpoken}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => handlePlayLine(currentIndex)}
              disabled={loading || !currentLine.voice_id}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : playing ? (
                <Pause className="h-4 w-4 mr-1" />
              ) : (
                <Play className="h-4 w-4 mr-1" />
              )}
              {playing ? "Playing…" : compactView ? "Play block" : "Play line"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => handlePlayAll(currentIndex)}
              disabled={loading || playableCount === 0}
            >
              <Play className="h-4 w-4 mr-1" />
              Play from here
            </Button>
            <Button variant="secondary" onClick={skipNext} disabled={loading}>
              <SkipForward className="h-4 w-4 mr-1" />
              Next
            </Button>
            {(playing || playAll) && (
              <Button variant="ghost" onClick={stop}>
                <Square className="h-4 w-4 mr-1" />
                Stop
              </Button>
            )}
          </div>
          {!currentLine.voice_id && (
            <p className="mt-3 text-body-sm text-warning">
              This speaker has no voice assigned yet.
            </p>
          )}
          {currentLine.voice_id && !compactView && (
            <div className="mt-4">
              <PerformLineRecorder
                lineId={currentLine.id}
                voiceId={currentLine.voice_id}
                voiceName={currentLine.voice_name}
                spokenText={currentLine.spoken_text}
              />
            </div>
          )}
        </Card>
      )}

      <div className="mt-8 max-h-[50vh] overflow-y-auto space-y-2 pr-2">
        {compactView
          ? blocks.map((block, i) => {
              const lead = block.lines[0]!;
              return (
                <button
                  key={block.key}
                  ref={(el) => {
                    if (el) lineButtonRefs.current.set(i, el);
                    else lineButtonRefs.current.delete(i);
                  }}
                  type="button"
                  onClick={() => setCurrentIndex(i)}
                  className={`w-full text-left rounded-md px-3 py-2 transition-colors ${
                    i === currentIndex
                      ? "bg-warm-sand border border-teal/30"
                      : "hover:bg-warm-sand/50"
                  } ${!lead.voice_id ? "opacity-60" : ""}`}
                >
                  <CompactSpeakerBlock
                    speakerLabel={block.speaker_label}
                    lineRange={`#${block.first_line_order}–${block.last_line_order}`}
                    voiceName={lead.voice_name}
                  >
                    <span className="line-clamp-4">{block.combined_text}</span>
                  </CompactSpeakerBlock>
                </button>
              );
            })
          : filtered.map((line, i) => (
              <button
                key={line.id}
                ref={(el) => {
                  if (el) lineButtonRefs.current.set(i, el);
                  else lineButtonRefs.current.delete(i);
                }}
                type="button"
                onClick={() => setCurrentIndex(i)}
                className={`w-full text-left rounded-md px-3 py-2 transition-colors ${
                  i === currentIndex
                    ? "bg-warm-sand border border-teal/30"
                    : "hover:bg-warm-sand/50"
                } ${!line.voice_id ? "opacity-60" : ""} ${
                  line.excluded_from_export ? "opacity-50 line-through" : ""
                }`}
              >
                <p className="text-xs text-slate mb-0.5">
                  #{line.line_order.toLocaleString()} · {line.speaker_label}
                  {line.excluded_from_export && " · skipped"}
                </p>
                <p className="font-serif text-sm break-words line-clamp-2">
                  {line.line_text}
                </p>
              </button>
            ))}
        {items.length === 0 && (
          <p className="text-slate font-serif italic">No lines match your filters.</p>
        )}
      </div>
    </div>
  );
}
