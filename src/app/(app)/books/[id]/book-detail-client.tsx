"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BookStatusBadge, CastStatusBadge } from "@/lib/books/status-badge";
import { runBatchAiReview } from "@/lib/books/run-ai-review-client";
import { VoicePickerDialog } from "@/components/voice-picker-dialog";
import { CharacterLinesDialog } from "@/components/books/character-lines-dialog";
import type { BookStatus, Character } from "@/lib/types/database";
import { voiceAssignmentsFromCharacters } from "@/lib/elevenlabs/voice-picker-utils";
import { displayBookTitle } from "@/lib/books/display-title";
import type { DetectedCharacter } from "@/lib/characters/match-status";

const ANALYSIS_STAGES = [
  { progress: 8, message: "Pouring through your manuscript…" },
  { progress: 22, message: "Extracting paragraphs from the docx…" },
  { progress: 38, message: "Tagging dialogue and narration…" },
  { progress: 55, message: "Decanting characters…" },
  { progress: 72, message: "Saving tagged lines…" },
  { progress: 88, message: "Pairing voices with characters…" },
  { progress: 95, message: "Almost done…" },
];

export function BookDetailClient({
  bookId,
  book,
  detectedCharacters,
  flaggedCount,
  roster,
  lineCount,
  chapterCount,
}: {
  bookId: string;
  book: {
    id: string;
    title: string;
    status: string;
    import_word_coverage?: number | null;
    import_paragraph_count?: number | null;
    import_line_count?: number | null;
    import_chapter_count?: number | null;
    analyzed_at?: string | null;
    series?: { name?: string; pen_names?: { name?: string } };
  };
  detectedCharacters: DetectedCharacter[];
  flaggedCount: number;
  roster: Character[];
  lineCount: number;
  chapterCount: number;
}) {
  const router = useRouter();
  const [pickerChar, setPickerChar] = useState<Character | null>(null);
  const [pickerSamples, setPickerSamples] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(book.status === "analyzing");
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [analyzeStage, setAnalyzeStage] = useState(0);
  const [mergeTarget, setMergeTarget] = useState<Record<string, string>>({});
  const [aiReviewLoading, setAiReviewLoading] = useState(false);
  const [aiReviewProgress, setAiReviewProgress] = useState(0);
  const [aiReviewMessage, setAiReviewMessage] = useState("");
  const [linesCharacter, setLinesCharacter] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const displayTitle = displayBookTitle(book.title);
  const seriesVoiceAssignments = useMemo(
    () => voiceAssignmentsFromCharacters(roster),
    [roster]
  );

  useEffect(() => {
    if (book.status === "analyzing") {
      setAnalyzing(true);
    }
  }, [book.status]);

  useEffect(() => {
    if (!analyzing) {
      setAnalyzeProgress(0);
      setAnalyzeStage(0);
      return;
    }

    let stage = 0;
    setAnalyzeProgress(ANALYSIS_STAGES[0].progress);
    setAnalyzeStage(0);

    const interval = setInterval(() => {
      stage = Math.min(stage + 1, ANALYSIS_STAGES.length - 1);
      setAnalyzeStage(stage);
      setAnalyzeProgress(ANALYSIS_STAGES[stage].progress);
    }, 4500);

    return () => clearInterval(interval);
  }, [analyzing]);

  async function rerunAnalysis() {
    setAnalyzing(true);
    setAnalyzeProgress(ANALYSIS_STAGES[0].progress);
    setAnalyzeStage(0);

    try {
      const res = await fetch(`/api/books/${bookId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_ai_review: false }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ?? "Analysis failed"
        );
      }

      setAnalyzeProgress(100);

      const summary = data as {
        total_lines?: number;
        flagged_count?: number;
        word_coverage?: number;
        chapter_count?: number;
        paragraph_count?: number;
      };

      const coveragePct =
        summary.word_coverage != null
          ? `${(summary.word_coverage * 100).toFixed(1)}% words`
          : "";
      toast.success(
        `Analysis complete — ${summary.total_lines?.toLocaleString() ?? "?"} lines, ${summary.chapter_count?.toLocaleString() ?? "?"} chapters${coveragePct ? `, ${coveragePct} preserved` : ""}, ${summary.flagged_count?.toLocaleString() ?? "?"} flagged`
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analysis failed");
      router.refresh();
    } finally {
      setAnalyzing(false);
    }
  }

  async function runAiReview() {
    setAiReviewLoading(true);
    setAiReviewProgress(3);
    setAiReviewMessage("Starting AI review…");

    try {
      const result = await runBatchAiReview(
        bookId,
        ({ message, progress }) => {
          setAiReviewMessage(message);
          setAiReviewProgress(progress);
        },
        flaggedCount
      );

      setAiReviewProgress(100);
      setAiReviewMessage("AI review complete");

      const humanLeft = result.pending_human_review ?? 0;
      toast.success(
        humanLeft > 0
          ? `AI updated ${result.lines_updated} lines, cleared ${result.lines_cleared ?? 0} flags — ${humanLeft} still need your review`
          : `AI updated ${result.lines_updated} lines, cleared ${result.lines_cleared ?? 0} flags`
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI review failed");
      router.refresh();
    } finally {
      setAiReviewLoading(false);
    }
  }

  async function mergeAlias(detected: DetectedCharacter) {
    const targetId =
      mergeTarget[detected.name] ?? detected.matched_character_id ?? undefined;
    if (!targetId) {
      toast.error("Choose a character to merge into");
      return;
    }
    const res = await fetch(`/api/books/${bookId}/merge-alias`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        alias_name: detected.name,
        target_character_id: targetId,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error((err as { error?: string }).error ?? "Merge failed");
      return;
    }
    toast.success(`Merged "${detected.name}" into roster`);
    router.refresh();
  }

  function openPicker(detected: DetectedCharacter) {
    const char =
      roster.find((c) => c.id === detected.matched_character_id) ??
      roster.find(
        (c) => c.canonical_name.toLowerCase() === detected.name.toLowerCase()
      );
    if (!char) {
      toast.error("Create character in library first");
      return;
    }
    setPickerChar(char);
    setPickerSamples(detected.sample_lines);
  }

  async function deleteProject() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/books/${bookId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "Delete failed");
      }
      toast.success(`Deleted "${displayTitle}"`);
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete project");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  const canExport =
    book.status === "ready_for_export" || book.status === "exported";
  const needsReview =
    flaggedCount > 0 ||
    book.status === "reviewing" ||
    book.status === "ready_for_review";

  return (
    <div className="space-y-8">
      <div className="border-b border-border pb-6">
        <p className="text-body-sm text-slate">
          {(book.series as { pen_names?: { name?: string } })?.pen_names?.name} /{" "}
          {(book.series as { name?: string })?.name}
        </p>
        <div className="mt-1 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-serif text-h1">{displayTitle}</h1>
            <div className="mt-2 flex items-center gap-2">
              <BookStatusBadge status={book.status as BookStatus} />
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-dark-red hover:text-dark-red hover:bg-dark-red/10"
            onClick={() => setDeleteOpen(true)}
          >
            Delete project
          </Button>
        </div>
        {analyzing && (
          <div className="mt-4 rounded-lg border border-teal/30 bg-teal/5 px-4 py-4 space-y-3 max-w-xl">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-teal shrink-0" />
              <p className="font-serif italic text-teal flex-1">
                {ANALYSIS_STAGES[analyzeStage]?.message ?? "Analyzing…"}
              </p>
              <span className="text-body-sm text-slate tabular-nums shrink-0">
                {analyzeProgress}%
              </span>
            </div>
            <Progress value={analyzeProgress} className="h-2" />
            <p className="text-body-sm text-slate">
              Rebuilding all manuscript lines from your docx. This usually takes
              30–90 seconds — use{" "}
              <strong>AI review flagged lines</strong> after it finishes.
            </p>
          </div>
        )}
        {aiReviewLoading && (
          <div className="mt-4 rounded-lg border border-burgundy/30 bg-burgundy/5 px-4 py-4 space-y-3 max-w-xl">
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
              Claude is reviewing flagged dialogue in batches. This may take a
              few minutes for a large manuscript — the bar advances as each batch
              completes.
            </p>
          </div>
        )}
        {book.status === "uploaded" && detectedCharacters.length === 0 && (
          <p className="mt-4 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-body-sm text-ink">
            Manuscript is saved but analysis has not finished. Click{" "}
            <strong>Re-run analysis</strong> — usually 30–60 seconds for a full novel.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href={`/books/${bookId}/cleanup`}>Manuscript cleanup</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href={`/books/${bookId}/manuscript`}>Speaker studio</Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={rerunAnalysis}
            disabled={analyzing || aiReviewLoading}
            title="Re-imports from the original Word file — undoes manual deletions"
          >
            {analyzing ? "Analyzing…" : "Re-import from Word"}
          </Button>
          {flaggedCount > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={runAiReview}
              disabled={analyzing || aiReviewLoading}
            >
              {aiReviewLoading ? "Running AI review…" : "AI review flagged lines"}
            </Button>
          )}
        </div>
        {lineCount > 0 && (
          <Card className="mt-4 max-w-xl border-teal/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-serif">Import summary</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2 text-body-sm">
              <p className="text-slate">Lines in studio</p>
              <p className="font-medium tabular-nums">
                {(book.import_line_count ?? lineCount).toLocaleString()}
              </p>
              <p className="text-slate">Chapters detected</p>
              <p className="font-medium tabular-nums">
                {(book.import_chapter_count ?? chapterCount).toLocaleString()}
              </p>
              {book.import_paragraph_count != null && (
                <>
                  <p className="text-slate">Blocks from docx</p>
                  <p className="font-medium tabular-nums">
                    {book.import_paragraph_count.toLocaleString()}
                  </p>
                </>
              )}
              {book.import_word_coverage != null && (
                <>
                  <p className="text-slate">Word coverage</p>
                  <p
                    className={`font-medium tabular-nums ${
                      book.import_word_coverage >= 0.98
                        ? "text-teal"
                        : "text-dark-red"
                    }`}
                  >
                    {(book.import_word_coverage * 100).toFixed(1)}%
                  </p>
                </>
              )}
              {book.analyzed_at && (
                <>
                  <p className="text-slate">Last analyzed</p>
                  <p className="font-medium">
                    {new Date(book.analyzed_at).toLocaleString()}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <h2 className="font-serif text-h2 mb-4">Detected characters</h2>
          <Table scrollable={false} className="table-fixed text-xs">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[15%] px-2 h-8 text-[10px]">
                  Character
                </TableHead>
                <TableHead className="w-[8%] px-2 h-8 text-[10px]">
                  Lines
                </TableHead>
                <TableHead className="w-[26%] px-2 h-8 text-[10px]">
                  Sample
                </TableHead>
                <TableHead className="w-[20%] px-2 h-8 text-[10px]">
                  Voice
                </TableHead>
                <TableHead className="w-[12%] px-2 h-8 text-[10px]">
                  Status
                </TableHead>
                <TableHead className="w-[19%] px-2 h-8 text-[10px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detectedCharacters.map((d) => (
                <TableRow key={d.name}>
                  <TableCell className="px-2 py-2 font-serif text-xs align-top">
                    <span className="block truncate" title={d.name}>
                      {d.name}
                    </span>
                    {d.suggested_alias_of && (
                      <p className="text-[11px] text-slate mt-0.5 truncate">
                        → {d.suggested_alias_of}?
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="px-2 py-2 font-mono text-xs tabular-nums align-top">
                    <button
                      type="button"
                      onClick={() => setLinesCharacter(d.name)}
                      className="text-teal hover:underline cursor-pointer"
                      title={`View all lines for ${d.name}`}
                    >
                      {d.line_count.toLocaleString()}
                    </button>
                  </TableCell>
                  <TableCell
                    className="px-2 py-2 font-serif text-[11px] italic text-slate align-top"
                    title={d.sample_lines[0]}
                  >
                    <span className="line-clamp-2 break-words">
                      {d.sample_lines[0] ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell
                    className="px-2 py-2 text-xs align-top"
                    title={d.voice_name ?? undefined}
                  >
                    {d.voice_name ? (
                      <span className="line-clamp-2 break-words text-ink">
                        {d.voice_name}
                      </span>
                    ) : (
                      <span className="text-slate">—</span>
                    )}
                  </TableCell>
                  <TableCell className="px-2 py-2 align-top">
                    <CastStatusBadge status={d.match_status} />
                  </TableCell>
                  <TableCell className="px-2 py-2 align-top space-y-1.5">
                    {(d.match_status === "possible_alias" ||
                      d.match_status === "new") && (
                      <div className="flex flex-col gap-1">
                        <Select
                          value={
                            mergeTarget[d.name] ?? d.matched_character_id ?? ""
                          }
                          onValueChange={(v) =>
                            setMergeTarget((m) => ({ ...m, [d.name]: v }))
                          }
                        >
                          <SelectTrigger className="h-7 w-full text-[11px] px-2">
                            <SelectValue placeholder="Merge into…" />
                          </SelectTrigger>
                          <SelectContent>
                            {roster.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.canonical_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 text-[11px] px-2"
                          onClick={() => mergeAlias(d)}
                        >
                          Merge
                        </Button>
                      </div>
                    )}
                    <Button
                      size="sm"
                      variant={
                        d.match_status === "cast" ? "outline" : "default"
                      }
                      className="h-7 text-[11px] px-2 w-full"
                      onClick={() => openPicker(d)}
                    >
                      {d.match_status === "cast" ? "Edit voice" : "Cast voice"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="space-y-4">
          <Card className="border-teal/20">
            <CardHeader>
              <CardTitle className="text-h3">Manuscript</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-body-sm text-slate mb-2">
                Clean up in document view, then assign speakers and voices in the
                studio.
              </p>
              <Button asChild className="w-full">
                <Link href={`/books/${bookId}/cleanup`}>Cleanup (document view)</Link>
              </Button>
              <Button asChild variant="secondary" className="w-full">
                <Link href={`/books/${bookId}/manuscript`}>Speaker studio</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-h3">Review</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-serif text-ink">{flaggedCount}</p>
              <p className="text-body-sm text-slate">flagged lines</p>
              {needsReview ? (
                <div className="mt-4 space-y-2">
                  <Button asChild variant="secondary" className="w-full">
                    <Link href={`/books/${bookId}/review`}>Review lines</Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full">
                    <Link href={`/books/${bookId}/manuscript?flagged=1`}>
                      Browse flagged in manuscript
                    </Link>
                  </Button>
                </div>
              ) : (
                <p className="mt-4 font-serif text-sm italic text-sage">
                  All clear — ready to export.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-h3">Pronunciation</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-body-sm text-slate mb-4">
                Proofread lines and fix how names and places are spoken before export.
              </p>
              <Button asChild variant="secondary" className="w-full">
                <Link href={`/books/${bookId}/pronunciation`}>
                  Pronunciation & proofread
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-h3">Listen</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-body-sm text-slate mb-4">
                Hear lines spoken with cast voices before export.
              </p>
              <Button asChild variant="secondary" className="w-full">
                <Link href={`/books/${bookId}/listen`}>Listen to manuscript</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-h3">Export</CardTitle>
            </CardHeader>
            <CardContent>
              <Button asChild disabled={!canExport} className="w-full">
                <Link href={`/books/${bookId}/export`}>Export CSV</Link>
              </Button>
              {!canExport && (
                <p className="mt-2 text-body-sm text-slate">
                  Cast all book characters and clear flagged lines first.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {pickerChar && (
        <VoicePickerDialog
          character={pickerChar}
          sampleLines={pickerSamples}
          open={!!pickerChar}
          onOpenChange={(o) => !o && setPickerChar(null)}
          onSaved={() => router.refresh()}
          assignedVoices={seriesVoiceAssignments}
        />
      )}

      <CharacterLinesDialog
        bookId={bookId}
        characterName={linesCharacter}
        open={!!linesCharacter}
        onOpenChange={(open) => !open && setLinesCharacter(null)}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete project?</DialogTitle>
            <DialogDescription>
              This permanently removes <strong>{displayTitle}</strong>, its
              manuscript, tagged lines, and casting progress. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              className="bg-dark-red hover:bg-dark-red/90"
              onClick={deleteProject}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete project"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
