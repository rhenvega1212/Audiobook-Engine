"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CastStatusBadge } from "@/lib/books/status-badge";
import { VoicePickerDialog } from "@/components/voice-picker-dialog";
import type { Character } from "@/lib/types/database";
import type { DetectedCharacter } from "@/lib/characters/match-status";

const LOADING_MESSAGES = [
  "Pouring through your manuscript…",
  "Sorting voices in the cellar…",
  "Decanting characters…",
  "Letting the dialogue breathe…",
  "Pairing voices with characters…",
];

export function BookDetailClient({
  bookId,
  book,
  detectedCharacters,
  flaggedCount,
  roster,
}: {
  bookId: string;
  book: {
    id: string;
    title: string;
    status: string;
    series?: { name?: string; pen_names?: { name?: string } };
  };
  detectedCharacters: DetectedCharacter[];
  flaggedCount: number;
  roster: Character[];
}) {
  const router = useRouter();
  const [pickerChar, setPickerChar] = useState<Character | null>(null);
  const [pickerSamples, setPickerSamples] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(book.status === "analyzing");

  const loadingMsg =
    LOADING_MESSAGES[Math.floor(Date.now() / 3000) % LOADING_MESSAGES.length];

  async function rerunAnalysis() {
    setAnalyzing(true);
    const res = await fetch(`/api/books/${bookId}/analyze`, { method: "POST" });
    setAnalyzing(false);
    if (!res.ok) {
      toast.error("Analysis failed");
      return;
    }
    toast.success("Analysis complete");
    router.refresh();
  }

  async function runAiReview() {
    const res = await fetch(`/api/books/${bookId}/ai-review`, {
      method: "POST",
    });
    if (!res.ok) {
      toast.error("AI review failed");
      return;
    }
    const data = await res.json();
    toast.success(`AI reviewed ${data.lines_updated} lines`);
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

  const canExport = book.status === "ready_for_export" || book.status === "exported";

  return (
    <div className="space-y-8">
      <div className="border-b border-border pb-6">
        <p className="text-body-sm text-slate">
          {(book.series as { pen_names?: { name?: string } })?.pen_names?.name} /{" "}
          {(book.series as { name?: string })?.name}
        </p>
        <h1 className="font-serif text-h1 mt-1">{book.title}</h1>
        <p className="mt-2 text-body-sm text-slate capitalize">
          Status: {book.status.replace(/_/g, " ")}
        </p>
        {analyzing && (
          <p className="mt-4 font-serif italic text-teal">{loadingMsg}</p>
        )}
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" size="sm" onClick={rerunAnalysis}>
            Re-run analysis
          </Button>
          {flaggedCount > 0 && (
            <Button variant="secondary" size="sm" onClick={runAiReview}>
              AI review flagged lines
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="font-serif text-h2 mb-4">Detected characters</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Character</TableHead>
                <TableHead>Lines</TableHead>
                <TableHead>Sample</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detectedCharacters.map((d) => (
                <TableRow key={d.name}>
                  <TableCell className="font-serif">{d.name}</TableCell>
                  <TableCell className="font-mono text-body-sm">
                    {d.line_count}
                  </TableCell>
                  <TableCell className="max-w-xs truncate font-serif text-sm italic text-slate">
                    {d.sample_lines[0] ?? "—"}
                  </TableCell>
                  <TableCell>
                    <CastStatusBadge status={d.match_status} />
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant={
                        d.match_status === "cast" ? "outline" : "default"
                      }
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
          <Card>
            <CardHeader>
              <CardTitle className="text-h3">Review</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-serif text-ink">{flaggedCount}</p>
              <p className="text-body-sm text-slate">flagged lines</p>
              {flaggedCount > 0 ? (
                <Button asChild variant="secondary" className="mt-4 w-full">
                  <Link href={`/books/${bookId}/review`}>Review lines</Link>
                </Button>
              ) : (
                <p className="mt-4 font-serif text-sm italic text-sage">
                  All clear. Ready to export.
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
              <CardTitle className="text-h3">Export</CardTitle>
            </CardHeader>
            <CardContent>
              <Button asChild disabled={!canExport} className="w-full">
                <Link href={`/books/${bookId}/export`}>Export CSV</Link>
              </Button>
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
        />
      )}
    </div>
  );
}
