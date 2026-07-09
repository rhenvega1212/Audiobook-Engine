"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Download,
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
import {
  groupConsecutiveSpeakerBlocks,
  type SpeakerBlock,
} from "@/lib/manuscript/group-lines";
import {
  renderChapterFile,
  type RenderLine,
} from "@/lib/audio/render-audiobook";

type ListenChapter = { title: string; start_line_order: number };

function chapterFmtDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = Math.round(totalSec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

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
  chapters,
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
  chapters: ListenChapter[];
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
  // Bumped whenever playback is stopped/restarted so a multi-chunk block can
  // bail out of its remaining chunks.
  const playGenRef = useRef(0);
  const [playingChapter, setPlayingChapter] = useState<number | null>(null);
  const [exportingChapter, setExportingChapter] = useState<number | null>(null);
  const [exportProgress, setExportProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);

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

  // Audio is ALWAYS generated per consecutive-same-speaker block so a run of
  // lines by the same voice plays as one continuous clip (no seam/pitch reset
  // between every line). `currentIndex` therefore always refers to a block
  // index; the "compact view" toggle only changes how the list below is shown.
  const blocks = useMemo(
    () => groupConsecutiveSpeakerBlocks(filtered),
    [filtered]
  );

  const lineIdToBlockIndex = useMemo(() => {
    const map = new Map<string, number>();
    blocks.forEach((block, i) => {
      for (const id of block.line_ids) map.set(id, i);
    });
    return map;
  }, [blocks]);

  // Chapter scoping is computed from the full audible line set (independent of
  // the search / speaker filters) so a chapter always covers its true range.
  const chapterRanges = useMemo(() => {
    if (chapters.length === 0) return [];
    const audible = lines.filter((l) => !l.excluded_from_export);
    const sorted = [...chapters].sort(
      (a, b) => a.start_line_order - b.start_line_order
    );
    return sorted.map((ch, idx) => {
      const start = ch.start_line_order;
      const end = sorted[idx + 1]?.start_line_order ?? Number.MAX_SAFE_INTEGER;
      const chLines = audible.filter(
        (l) => l.line_order >= start && l.line_order < end
      );
      return {
        title: ch.title,
        start_line_order: start,
        lines: chLines,
        lineCount: chLines.length,
        playableCount: chLines.filter((l) => l.voice_id).length,
      };
    });
  }, [chapters, lines]);

  // Block index of each line within the full audible list — used to highlight
  // the playing block during chapter playback regardless of active filters
  // (which are cleared when a chapter starts, so this matches `blocks`).
  const audibleBlockIndexByLineId = useMemo(() => {
    const audible = lines.filter((l) => !l.excluded_from_export);
    const ab = groupConsecutiveSpeakerBlocks(audible);
    const map = new Map<string, number>();
    ab.forEach((b, i) => {
      for (const id of b.line_ids) map.set(id, i);
    });
    return map;
  }, [lines]);

  useEffect(() => {
    if (!initialLineId) return;
    const blockIdx = lineIdToBlockIndex.get(initialLineId);
    if (blockIdx !== undefined) setCurrentIndex(blockIdx);
  }, [initialLineId, lineIdToBlockIndex]);

  useEffect(() => {
    setCurrentIndex(0);
  }, [speakerFilter, search, showExcluded]);

  useEffect(() => {
    lineButtonRefs.current.get(currentIndex)?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [currentIndex, compactView]);

  const currentBlock = blocks[currentIndex] ?? blocks[0];
  const currentLine = currentBlock?.lines[0] ?? filtered[0];

  const displayText = currentBlock?.combined_text ?? currentLine?.line_text ?? "";

  const displaySpoken =
    currentBlock?.lines.map((l) => l.spoken_text).join("\n") ??
    currentLine?.spoken_text ??
    "";

  function stop() {
    playGenRef.current++;
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(false);
    setPlayAll(false);
    playAllRef.current = false;
    setPlayingChapter(null);
  }

  // Split a speaker block's lines into chunks that each stay under the TTS
  // request limit, so long same-speaker runs still play as few clips as
  // possible without any text being truncated.
  function chunkBlockLines(lines: ListenLine[]): ListenLine[][] {
    const MAX_TTS_CHARS = 2400;
    const chunks: ListenLine[][] = [];
    let current: ListenLine[] = [];
    let length = 0;
    for (const line of lines) {
      const addition = (line.spoken_text?.trim().length ?? 0) + 1;
      if (current.length > 0 && length + addition > MAX_TTS_CHARS) {
        chunks.push(current);
        current = [];
        length = 0;
      }
      current.push(line);
      length += addition;
    }
    if (current.length > 0) chunks.push(current);
    return chunks;
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

  async function playBlock(
    block: SpeakerBlock<ListenLine>,
    gen: number
  ): Promise<boolean> {
    const voiceLine = block.lines.find((l) => l.voice_id) ?? block.lines[0]!;
    const chunks = chunkBlockLines(block.lines);

    let anyOk = false;
    for (const chunk of chunks) {
      if (playGenRef.current !== gen) break;
      const ok = await playText(
        voiceLine.id,
        voiceLine.voice_id,
        chunk.map((l) => l.spoken_text).join("\n"),
        block.speaker_label,
        voiceLine.voice_playback
      );
      anyOk = anyOk || ok;
      if (!ok) break;
    }
    return anyOk;
  }

  async function playAt(index: number): Promise<boolean> {
    const block = blocks[index];
    if (!block) return false;
    setCurrentIndex(index);
    return playBlock(block, playGenRef.current);
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

    for (let i = fromIndex; i < blocks.length; i++) {
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
    const next = Math.min(currentIndex + 1, blocks.length - 1);
    setCurrentIndex(next);
    if (playing || playAll) handlePlayLine(next);
  }

  async function playChapter(idx: number) {
    const info = chapterRanges[idx];
    if (!info) return;
    if (info.playableCount === 0) {
      toast.error("No cast voices in this chapter yet");
      return;
    }
    stop();
    // Clear filters so the visible list matches the full playback order.
    setSpeakerFilter("all");
    setSearch("");
    setShowExcluded(false);
    const gen = playGenRef.current;
    const chapterBlocks = groupConsecutiveSpeakerBlocks(info.lines);
    setPlayAll(true);
    playAllRef.current = true;
    setPlayingChapter(idx);

    for (const block of chapterBlocks) {
      if (playGenRef.current !== gen) break;
      const highlight = audibleBlockIndexByLineId.get(block.line_ids[0]!);
      if (highlight !== undefined) setCurrentIndex(highlight);
      const ok = await playBlock(block, gen);
      if (!ok && playGenRef.current === gen) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    if (playGenRef.current === gen) {
      setPlayAll(false);
      playAllRef.current = false;
      setPlayingChapter(null);
    }
  }

  async function exportChapter(idx: number) {
    const info = chapterRanges[idx];
    if (!info) return;
    if (info.playableCount === 0) {
      toast.error("No cast voices in this chapter yet");
      return;
    }
    const controller = new AbortController();
    exportAbortRef.current = controller;
    setExportingChapter(idx);
    setExportProgress({ done: 0, total: 0 });
    try {
      const renderLines: RenderLine[] = info.lines.map((l) => ({
        id: l.id,
        line_order: l.line_order,
        speaker_label: l.speaker_label,
        spoken_text: l.spoken_text,
        voice_id: l.voice_id,
        language_code: l.voice_playback?.language_code ?? null,
        voice_settings: l.voice_playback?.voice_settings ?? null,
      }));
      const file = await renderChapterFile(info.title, renderLines, {
        signal: controller.signal,
        onProgress: (done, total) => setExportProgress({ done, total }),
      });
      downloadBlob(file.blob, file.filename);
      toast.success(
        `Exported “${info.title}” (${chapterFmtDuration(file.durationSec)})`
      );
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        toast.message("Chapter export cancelled");
      } else {
        toast.error(e instanceof Error ? e.message : "Chapter export failed");
      }
    } finally {
      setExportingChapter(null);
      setExportProgress(null);
      exportAbortRef.current = null;
    }
  }

  function cancelExport() {
    exportAbortRef.current?.abort();
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
        Hear lines spoken with cast voices — consecutive lines by the same
        speaker play as one continuous clip for smoother cadence.{" "}
        {playableCount.toLocaleString()} of{" "}
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
          Compact view (collapse same-speaker runs in the list)
        </label>
        <Button asChild variant="outline" size="sm">
          <Link href={`/books/${bookId}/manuscript`}>Edit in manuscript studio</Link>
        </Button>
      </div>

      {chapterRanges.length > 0 && (
        <Card className="mt-6 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-serif text-h3">Chapters</h2>
            <span className="text-xs text-slate">
              {chapterRanges.length} chapters · play or export mastered MP3s
            </span>
          </div>
          <div className="max-h-[40vh] divide-y divide-border overflow-y-auto pr-1">
            {chapterRanges.map((ch, i) => {
              const isPlaying = playingChapter === i;
              const isExporting = exportingChapter === i;
              const busyElsewhere =
                (exportingChapter !== null && !isExporting) ||
                (playingChapter !== null && !isPlaying);
              return (
                <div
                  key={`${ch.start_line_order}-${i}`}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">{ch.title}</p>
                    <p className="text-xs text-slate">
                      {ch.lineCount.toLocaleString()} lines
                      {ch.playableCount < ch.lineCount &&
                        ` · ${ch.playableCount.toLocaleString()} with voice`}
                    </p>
                    {isExporting && exportProgress && (
                      <p className="mt-0.5 text-xs text-teal">
                        {exportProgress.total > 0
                          ? `Rendering ${exportProgress.done}/${exportProgress.total} clips…`
                          : "Preparing…"}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {isPlaying ? (
                      <Button variant="ghost" size="sm" onClick={stop}>
                        <Square className="mr-1 h-4 w-4" />
                        Stop
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => playChapter(i)}
                        disabled={ch.playableCount === 0 || busyElsewhere || loading}
                      >
                        <Play className="mr-1 h-4 w-4" />
                        Play chapter
                      </Button>
                    )}
                    {isExporting ? (
                      <Button variant="ghost" size="sm" onClick={cancelExport}>
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        Cancel
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => exportChapter(i)}
                        disabled={ch.playableCount === 0 || busyElsewhere}
                      >
                        <Download className="mr-1 h-4 w-4" />
                        Export MP3
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-slate">
            Chapter MP3s are mastered to platform specs (192&nbsp;kbps CBR,
            44.1&nbsp;kHz, loudness-normalized). Rendering runs in your browser —
            keep this tab open while exporting.
          </p>
        </Card>
      )}

      {currentLine && (
        <Card className="mt-6 p-4 border-l-4 border-l-teal">
          {currentBlock && currentBlock.lines.length > 1 ? (
            <p className="text-xs uppercase tracking-wider text-slate mb-2">
              Lines {currentBlock.first_line_order.toLocaleString()}–
              {currentBlock.last_line_order.toLocaleString()} ·{" "}
              {currentBlock.speaker_label}
              {currentLine.voice_name && (
                <span className="ml-2 normal-case">({currentLine.voice_name})</span>
              )}
              <span className="ml-2 normal-case">· plays as one clip</span>
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
              {playing
                ? "Playing…"
                : currentBlock && currentBlock.lines.length > 1
                  ? "Play block"
                  : "Play line"}
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
          {currentLine.voice_id &&
            !compactView &&
            currentBlock &&
            currentBlock.lines.length === 1 && (
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
          : filtered.map((line) => {
              const blockIdx = lineIdToBlockIndex.get(line.id) ?? 0;
              const block = blocks[blockIdx];
              const isLead = block?.line_ids[0] === line.id;
              const active = blockIdx === currentIndex;
              return (
                <button
                  key={line.id}
                  ref={(el) => {
                    if (!isLead) return;
                    if (el) lineButtonRefs.current.set(blockIdx, el);
                    else lineButtonRefs.current.delete(blockIdx);
                  }}
                  type="button"
                  onClick={() => setCurrentIndex(blockIdx)}
                  className={`w-full text-left rounded-md px-3 py-2 transition-colors ${
                    active
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
              );
            })}
        {filtered.length === 0 && (
          <p className="text-slate font-serif italic">No lines match your filters.</p>
        )}
      </div>
    </div>
  );
}
