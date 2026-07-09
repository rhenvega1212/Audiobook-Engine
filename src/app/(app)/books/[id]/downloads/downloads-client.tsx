"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import JSZip from "jszip";
import { Download, FileText, Loader2, Music, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  renderChapterFile,
  type RenderChapter,
  type RenderLine,
} from "@/lib/audio/render-audiobook";

function slugify(text: string): string {
  return (
    text
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "chapter"
  );
}

function escapeCsv(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type Section = {
  title: string;
  lines: RenderLine[];
  lineCount: number;
  castCount: number;
  uncastSpeakers: string[];
};

type Busy =
  | { kind: "mp3"; index: number }
  | { kind: "all-mp3" }
  | null;

export function DownloadsClient({
  bookId,
  bookTitle,
  lines,
  chapters,
}: {
  bookId: string;
  bookTitle: string;
  lines: RenderLine[];
  chapters: RenderChapter[];
}) {
  const [busy, setBusy] = useState<Busy>(null);
  const [progress, setProgress] = useState<{
    label: string;
    done: number;
    total: number;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sections = useMemo<Section[]>(() => {
    const sorted = [...lines].sort((a, b) => a.line_order - b.line_order);

    function summarize(title: string, sectionLines: RenderLine[]): Section {
      let castCount = 0;
      const uncast = new Set<string>();
      for (const l of sectionLines) {
        if (l.voice_id) castCount++;
        else if (l.speaker_label !== "UNKNOWN") uncast.add(l.speaker_label);
      }
      return {
        title,
        lines: sectionLines,
        lineCount: sectionLines.length,
        castCount,
        uncastSpeakers: [...uncast].sort(),
      };
    }

    if (chapters.length === 0) {
      return [summarize("Audiobook", sorted)];
    }

    const sortedChapters = [...chapters].sort(
      (a, b) => a.start_line_order - b.start_line_order
    );
    return sortedChapters.map((ch, i) => {
      const start = ch.start_line_order;
      const end =
        sortedChapters[i + 1]?.start_line_order ?? Number.MAX_SAFE_INTEGER;
      const sectionLines = sorted.filter(
        (l) => l.line_order >= start && l.line_order < end
      );
      return summarize(ch.title, sectionLines);
    });
  }, [lines, chapters]);

  const renderableCount = sections.filter((s) => s.castCount > 0).length;
  const padWidth = Math.max(2, String(sections.length).length);

  async function renderSection(section: Section): Promise<Blob> {
    const controller = new AbortController();
    abortRef.current = controller;
    const file = await renderChapterFile(section.title, section.lines, {
      onProgress: (done, total) =>
        setProgress({ label: section.title, done, total }),
      signal: controller.signal,
    });
    return file.blob;
  }

  async function downloadChapterMp3(index: number) {
    if (busy) return;
    const section = sections[index]!;
    setBusy({ kind: "mp3", index });
    setProgress({ label: section.title, done: 0, total: 0 });
    try {
      const blob = await renderSection(section);
      triggerDownload(
        blob,
        `${String(index + 1).padStart(padWidth, "0")}_${slugify(section.title)}.mp3`
      );
      toast.success(`Downloaded “${section.title}” audio`);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        toast.message("Render cancelled");
      } else {
        toast.error(e instanceof Error ? e.message : "Render failed");
      }
    } finally {
      setBusy(null);
      setProgress(null);
      abortRef.current = null;
    }
  }

  function downloadChapterCsv(index: number) {
    const section = sections[index]!;
    const rows = section.lines.map(
      (l) => `${escapeCsv(l.speaker_label)},${escapeCsv(l.spoken_text)}`
    );
    const csv = ["Speaker,Line", ...rows].join("\n");
    triggerDownload(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
      `${String(index + 1).padStart(padWidth, "0")}_${slugify(section.title)}.csv`
    );
    toast.success(`Downloaded “${section.title}” script`);
  }

  async function downloadAllMp3() {
    if (busy) return;
    setBusy({ kind: "all-mp3" });
    const controller = new AbortController();
    abortRef.current = controller;
    const zip = new JSZip();
    let rendered = 0;
    try {
      for (let i = 0; i < sections.length; i++) {
        const section = sections[i]!;
        if (section.castCount === 0) continue;
        const file = await renderChapterFile(section.title, section.lines, {
          onProgress: (done, total) =>
            setProgress({
              label: `Chapter ${i + 1}/${sections.length}: ${section.title}`,
              done,
              total,
            }),
          signal: controller.signal,
        });
        zip.file(
          `${String(i + 1).padStart(padWidth, "0")}_${slugify(section.title)}.mp3`,
          file.blob
        );
        rendered++;
      }
      if (rendered === 0) {
        toast.error("No chapters have cast lines to render");
        return;
      }
      const blob = await zip.generateAsync({ type: "blob" });
      triggerDownload(blob, `${slugify(bookTitle)}-chapters.zip`);
      toast.success(`Downloaded ${rendered} chapter MP3s (ZIP)`);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        toast.message("Render cancelled");
      } else {
        toast.error(e instanceof Error ? e.message : "Render failed");
      }
    } finally {
      setBusy(null);
      setProgress(null);
      abortRef.current = null;
    }
  }

  function downloadAllCsv() {
    const zip = new JSZip();
    sections.forEach((section, i) => {
      const rows = section.lines.map(
        (l) => `${escapeCsv(l.speaker_label)},${escapeCsv(l.spoken_text)}`
      );
      const csv = ["Speaker,Line", ...rows].join("\n");
      zip.file(
        `${String(i + 1).padStart(padWidth, "0")}_${slugify(section.title)}.csv`,
        csv
      );
    });
    void zip.generateAsync({ type: "blob" }).then((blob) => {
      triggerDownload(blob, `${slugify(bookTitle)}-scripts.zip`);
      toast.success("Downloaded all chapter scripts (ZIP)");
    });
  }

  const pct =
    progress && progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : 0;

  return (
    <div>
      <Link
        href={`/books/${bookId}`}
        className="text-body-sm text-teal hover:underline"
      >
        ← {bookTitle}
      </Link>

      <h1 className="font-serif text-h1 mt-4">Export</h1>
      <p className="mt-2 text-body-sm text-slate max-w-2xl">
        Download files for each chapter. <strong>Audio (MP3)</strong> is
        rendered in your browser and mastered to platform specs
        (192&nbsp;kbps CBR, 44.1&nbsp;kHz, loudness-normalized) for KDP/Audible,
        Spotify, and similar. <strong>Script (CSV)</strong> is the
        speaker-and-line file for ElevenLabs Studio. Keep this tab open while
        audio renders.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={() => void downloadAllMp3()} disabled={!!busy || renderableCount === 0}>
          <Download className="h-4 w-4 mr-1.5" />
          Download all audio (ZIP)
        </Button>
        <Button variant="secondary" onClick={downloadAllCsv} disabled={!!busy}>
          <FileText className="h-4 w-4 mr-1.5" />
          Download all scripts (ZIP)
        </Button>
        <Button asChild variant="outline">
          <Link href={`/books/${bookId}/produce`}>Full audiobook + credits…</Link>
        </Button>
      </div>

      {busy && progress && (
        <Card className="mt-6 border-teal/30">
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Loader2 className="h-4 w-4 animate-spin text-teal shrink-0" />
                <p className="truncate text-sm text-ink">{progress.label}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => abortRef.current?.abort()}
              >
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            </div>
            <Progress value={pct} active />
            <p className="text-xs text-slate">
              {progress.total > 0
                ? `${progress.done}/${progress.total} clips voiced`
                : "Preparing…"}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="mt-6 space-y-2">
        {sections.map((section, i) => {
          const isRenderingThis =
            busy?.kind === "mp3" && busy.index === i;
          const noCast = section.castCount === 0;
          return (
            <Card key={`${section.title}-${i}`}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-serif text-ink truncate">
                    <span className="text-slate tabular-nums mr-2">
                      {String(i + 1).padStart(padWidth, "0")}
                    </span>
                    {section.title}
                  </p>
                  <p className="text-xs text-slate mt-0.5">
                    {section.lineCount.toLocaleString()} line
                    {section.lineCount === 1 ? "" : "s"}
                    {section.castCount < section.lineCount && (
                      <>
                        {" · "}
                        <span className="text-warning">
                          {(section.lineCount - section.castCount).toLocaleString()}{" "}
                          uncast
                        </span>
                        {section.uncastSpeakers.length > 0 &&
                          ` (${section.uncastSpeakers.slice(0, 3).join(", ")}${
                            section.uncastSpeakers.length > 3 ? "…" : ""
                          })`}
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!!busy || noCast}
                    title={
                      noCast
                        ? "No cast lines in this chapter"
                        : "Render and download MP3"
                    }
                    onClick={() => void downloadChapterMp3(i)}
                  >
                    {isRenderingThis ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Music className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    MP3
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={section.lineCount === 0}
                    onClick={() => downloadChapterCsv(i)}
                  >
                    <FileText className="h-3.5 w-3.5 mr-1.5" />
                    CSV
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
