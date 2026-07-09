"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import JSZip from "jszip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { VoiceSettings } from "@/lib/elevenlabs/voice-settings";
import {
  renderAudiobook,
  type RenderChapter,
  type RenderLine,
  type RenderProgress,
  type RenderedFile,
} from "@/lib/audio/render-audiobook";

function slugify(text: string): string {
  return (
    text
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "audiobook"
  );
}

function formatDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = Math.round(totalSec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function defaultOpening(title: string, author: string): string {
  const by = author.trim() ? `, written by ${author.trim()}` : "";
  return `This is ${title}${by}, narrated by AI.`;
}

function defaultClosing(title: string, author: string): string {
  const by = author.trim() ? `, written by ${author.trim()}` : "";
  return `You have been listening to ${title}${by}. The end.`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ProduceClient({
  bookId,
  bookTitle,
  defaultAuthor,
  lines,
  chapters,
  narratorVoiceId,
  narratorVoiceName,
  narratorLanguageCode,
  narratorVoiceSettings,
  uncastSpeakers,
  audibleLineCount,
  audibleWithVoiceCount,
  chapterCount,
}: {
  bookId: string;
  bookTitle: string;
  defaultAuthor: string;
  lines: RenderLine[];
  chapters: RenderChapter[];
  narratorVoiceId: string | null;
  narratorVoiceName: string | null;
  narratorLanguageCode: string | null;
  narratorVoiceSettings: VoiceSettings | null;
  uncastSpeakers: string[];
  audibleLineCount: number;
  audibleWithVoiceCount: number;
  chapterCount: number;
}) {
  const [author, setAuthor] = useState(defaultAuthor);
  const [openingText, setOpeningText] = useState(() =>
    defaultOpening(bookTitle, defaultAuthor)
  );
  const [closingText, setClosingText] = useState(() =>
    defaultClosing(bookTitle, defaultAuthor)
  );
  const openingEdited = useRef(false);
  const closingEdited = useRef(false);

  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState<RenderProgress | null>(null);
  const [files, setFiles] = useState<RenderedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Keep credit templates in sync with the author until the user edits them.
  useEffect(() => {
    if (!openingEdited.current) setOpeningText(defaultOpening(bookTitle, author));
    if (!closingEdited.current) setClosingText(defaultClosing(bookTitle, author));
  }, [author, bookTitle]);

  const fileCountEstimate = useMemo(
    () => (chapterCount > 0 ? chapterCount : 1) + (narratorVoiceId ? 2 : 0),
    [chapterCount, narratorVoiceId]
  );

  const canRender = audibleWithVoiceCount > 0 && !rendering;

  async function handleGenerate() {
    setError(null);
    setFiles([]);
    setProgress(null);
    setRendering(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await renderAudiobook({
        lines,
        chapters,
        narratorVoiceId,
        narratorLanguageCode,
        narratorVoiceSettings,
        openingCreditsText: openingText,
        closingCreditsText: closingText,
        onProgress: setProgress,
        signal: controller.signal,
      });
      setFiles(result);
      toast.success(
        `Rendered ${result.length} file${result.length === 1 ? "" : "s"}`
      );
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        toast.message("Render cancelled");
      } else {
        const message = e instanceof Error ? e.message : "Render failed";
        setError(message);
        toast.error(message);
      }
    } finally {
      setRendering(false);
      abortRef.current = null;
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
  }

  async function downloadZip() {
    const zip = new JSZip();
    for (const file of files) {
      zip.file(file.filename, file.blob);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    triggerDownload(blob, `${slugify(bookTitle)}-audiobook.zip`);
    toast.success("ZIP downloaded");
  }

  const totalDuration = files.reduce((s, f) => s + f.durationSec, 0);
  const pct =
    progress && progress.clipsTotal > 0
      ? Math.round((progress.clipsDone / progress.clipsTotal) * 100)
      : 0;

  return (
    <div>
      <Link
        href={`/books/${bookId}`}
        className="text-body-sm text-teal hover:underline"
      >
        ← {bookTitle}
      </Link>

      <h1 className="font-serif text-h1 mt-4">Produce audiobook</h1>
      <p className="mt-2 text-body-sm text-slate max-w-2xl">
        Generate upload-ready MP3 files — one per chapter, plus opening and
        closing credits — mastered to platform specs (192&nbsp;kbps CBR,
        44.1&nbsp;kHz, loudness-normalized) for KDP/Audible, Spotify, and
        similar. Rendering happens in your browser, so keep this tab open until
        it finishes.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardContent className="pt-6 space-y-5">
              <div>
                <Label htmlFor="author">Author name (for credits)</Label>
                <Input
                  id="author"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="e.g. Michele Scott"
                  className="mt-1.5"
                  disabled={rendering}
                />
              </div>

              <div>
                <Label htmlFor="opening">Opening credits (spoken)</Label>
                <textarea
                  id="opening"
                  value={openingText}
                  onChange={(e) => {
                    openingEdited.current = true;
                    setOpeningText(e.target.value);
                  }}
                  rows={2}
                  disabled={rendering}
                  className="mt-1.5 flex w-full rounded-md border border-border bg-bone px-3 py-2.5 text-sm text-ink placeholder:text-slate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/30 focus-visible:border-teal disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              <div>
                <Label htmlFor="closing">Closing credits (spoken)</Label>
                <textarea
                  id="closing"
                  value={closingText}
                  onChange={(e) => {
                    closingEdited.current = true;
                    setClosingText(e.target.value);
                  }}
                  rows={2}
                  disabled={rendering}
                  className="mt-1.5 flex w-full rounded-md border border-border bg-bone px-3 py-2.5 text-sm text-ink placeholder:text-slate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/30 focus-visible:border-teal disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              <p className="text-xs text-slate">
                Credits are voiced with your Narrator voice
                {narratorVoiceName ? ` (${narratorVoiceName})` : ""}. Platforms
                require an AI-narration disclosure in the opening credits — keep
                the &ldquo;narrated by AI&rdquo; wording (or your approved
                equivalent).
              </p>
            </CardContent>
          </Card>

          {files.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <h2 className="font-serif text-h3">
                    {files.length} file{files.length === 1 ? "" : "s"} ·{" "}
                    {formatDuration(totalDuration)}
                  </h2>
                  <Button size="sm" onClick={downloadZip}>
                    Download all (ZIP)
                  </Button>
                </div>
                <ul className="mt-4 divide-y divide-border">
                  {files.map((file) => (
                    <li
                      key={file.filename}
                      className="flex items-center justify-between py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-ink">{file.title}</p>
                        <p className="truncate text-xs text-slate">
                          {file.filename} · {formatDuration(file.durationSec)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => triggerDownload(file.blob, file.filename)}
                      >
                        Download
                      </Button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="text-sm text-slate space-y-1">
                <p>
                  <span className="text-ink font-medium">
                    {audibleWithVoiceCount.toLocaleString()}
                  </span>{" "}
                  of {audibleLineCount.toLocaleString()} lines have a cast voice
                </p>
                <p>
                  <span className="text-ink font-medium">
                    {fileCountEstimate}
                  </span>{" "}
                  files to render
                  {chapterCount === 0 && " (no chapters detected — one file)"}
                </p>
              </div>

              {!narratorVoiceId && (
                <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs">
                  No Narrator voice is cast, so opening/closing credit files will
                  be skipped. Cast the Narrator character to include required
                  credits.
                </div>
              )}

              {uncastSpeakers.length > 0 && (
                <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs space-y-1">
                  <p className="font-medium">
                    {uncastSpeakers.length} uncast speaker
                    {uncastSpeakers.length === 1 ? "" : "s"} — their lines will be
                    skipped:
                  </p>
                  <p className="text-slate">{uncastSpeakers.join(", ")}</p>
                </div>
              )}

              {!rendering && (
                <Button
                  className="w-full"
                  onClick={handleGenerate}
                  disabled={!canRender}
                >
                  Generate audiobook files
                </Button>
              )}

              {rendering && (
                <div className="space-y-3">
                  <Progress value={pct} active />
                  <div className="text-xs text-slate space-y-0.5">
                    <p className="text-ink">{progress?.message ?? "Working…"}</p>
                    {progress && (
                      <p>
                        {progress.clipsDone}/{progress.clipsTotal} clips ·{" "}
                        {progress.filesDone}/{progress.filesTotal} files
                      </p>
                    )}
                  </div>
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={handleCancel}
                  >
                    Cancel
                  </Button>
                </div>
              )}

              {audibleWithVoiceCount === 0 && (
                <p className="text-xs text-slate">
                  No lines have a cast voice yet. Cast your characters before
                  producing audio.
                </p>
              )}

              {error && (
                <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
                  {error}
                </div>
              )}

              <p className="text-xs text-slate">
                Files are named sequentially (01_opening-credits.mp3, then one
                per chapter). Upload the whole set to your platform&apos;s
                per-chapter uploader.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
