"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { Card, CardContent } from "@/components/ui/card";
import type { PenName, Series } from "@/lib/types/database";
import { runBatchAiReview } from "@/lib/books/run-ai-review-client";

type UploadPhase = "idle" | "uploading" | "analyzing" | "ai_review" | "done";

export function NewBookForm({
  penNames,
  series: allSeries,
}: {
  penNames: PenName[];
  series: Series[];
}) {
  const router = useRouter();
  const [penNameId, setPenNameId] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<UploadPhase>("idle");

  const filteredSeries = penNameId
    ? allSeries.filter((s) => s.pen_name_id === penNameId)
    : allSeries;

  const loading =
    phase === "uploading" || phase === "analyzing" || phase === "ai_review";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !seriesId || !title) return;

    const readinessRes = await fetch(
      `/api/series/${seriesId}/analyze-readiness`
    );
    const readiness = await readinessRes.json().catch(() => ({}));
    if (!readinessRes.ok || !(readiness as { ready?: boolean }).ready) {
      const issues = (readiness as { issues?: { canonical_name: string }[] })
        .issues;
      const names = issues?.map((i) => i.canonical_name).join(", ") ?? "";
      toast.error(
        names
          ? `Add aliases for: ${names} (Character Library) before analyzing`
          : "Series cast is not ready — add aliases for series regulars"
      );
      return;
    }

    setPhase("uploading");
    const formData = new FormData();
    formData.append("series_id", seriesId);
    formData.append("title", title);
    formData.append("file", file);

    let bookId: string | undefined;
    try {
      const res = await fetch("/api/books", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(
          (data as { error?: string }).error ?? "Upload failed"
        );
        setPhase("idle");
        return;
      }

      bookId =
        (data as { id?: string }).id ??
        (data as { book?: { id?: string } }).book?.id;

      if (!bookId) {
        toast.error("Upload succeeded but book id was missing");
        setPhase("idle");
        return;
      }

      toast.success("Manuscript uploaded");
      setPhase("analyzing");

      const analyzeRes = await fetch(`/api/books/${bookId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_ai_review: false }),
      });
      const analyzeData = await analyzeRes.json().catch(() => ({}));

      if (!analyzeRes.ok) {
        toast.error(
          (analyzeData as { error?: string }).error ??
            "Analysis failed — open the book and click Re-run analysis"
        );
        router.push(`/books/${bookId}`);
        router.refresh();
        setPhase("idle");
        return;
      }

      const summary = analyzeData as {
        total_lines?: number;
        flagged_count?: number;
      };

      setPhase("ai_review");
      let aiCleared = 0;
      try {
        const aiResult = await runBatchAiReview(
          bookId,
          () => {},
          summary.flagged_count
        );
        aiCleared = aiResult.lines_cleared ?? 0;
      } catch {
        toast.message(
          "Rules analysis done — AI review skipped or failed. You can run it from Review."
        );
      }

      toast.success(
        `${summary.total_lines ?? "?"} lines — ${summary.flagged_count ?? "?"} flagged for review${aiCleared ? ` (${aiCleared} cleared by AI)` : ""}`
      );
      setPhase("done");
      router.push(`/books/${bookId}/review`);
      router.refresh();
    } catch {
      toast.error(
        bookId
          ? "Analysis may have timed out — open the book and Re-run analysis"
          : "Upload failed — try again"
      );
      if (bookId) router.push(`/books/${bookId}`);
      setPhase("idle");
    }
  }

  return (
    <Card className="max-w-xl">
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Pen name</Label>
            <Select
              value={penNameId}
              onValueChange={(v) => {
                setPenNameId(v);
                setSeriesId("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select pen name" />
              </SelectTrigger>
              <SelectContent>
                {penNames.map((pn) => (
                  <SelectItem key={pn.id} value={pn.id}>
                    {pn.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Series</Label>
            <Select
              value={seriesId}
              onValueChange={setSeriesId}
              disabled={!penNameId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select series" />
              </SelectTrigger>
              <SelectContent>
                {filteredSeries.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="title">Book title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Murder by the Glass"
              required
            />
          </div>

          <div>
            <Label htmlFor="file">Manuscript (.docx)</Label>
            <Input
              id="file"
              type="file"
              accept=".docx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
            />
            {file && (
              <p className="text-xs text-slate mt-1">
                {(file.size / 1024 / 1024).toFixed(2)} MB — large books may take
                30–60 seconds to analyze
              </p>
            )}
          </div>

          <Button type="submit" disabled={loading}>
            {phase === "uploading"
              ? "Uploading manuscript…"
              : phase === "analyzing"
                ? "Tagging dialogue (rules)…"
                : phase === "ai_review"
                  ? "AI review (batched)…"
                  : "Upload & analyze"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
