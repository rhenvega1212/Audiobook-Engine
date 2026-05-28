"use client";

import Link from "next/link";
import { useState } from "react";
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
import { Card, CardContent } from "@/components/ui/card";

export function ExportClient({
  bookId,
  bookTitle,
  status,
  previewLines,
  totalLines,
  exportableLines,
  excludedCount,
}: {
  bookId: string;
  bookTitle: string;
  status: string;
  previewLines: { speaker: string; voice: string; line: string }[];
  totalLines: number;
  exportableLines: number;
  excludedCount: number;
}) {
  const [exported, setExported] = useState(status === "exported");
  const [downloading, setDownloading] = useState(false);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);

  async function downloadCsv(force = false) {
    setDownloading(true);
    setValidationWarnings([]);
    const url = `/api/books/${bookId}/export${force ? "?force=1" : ""}`;
    const res = await fetch(url);
    setDownloading(false);

    if (res.status === 422) {
      const data = await res.json();
      setValidationWarnings(data.warnings ?? [data.error]);
      toast.error("Export blocked — fix issues below or force download");
      return;
    }

    if (!res.ok) {
      toast.error("Export failed");
      return;
    }

    const blob = await res.blob();
    const warnings = res.headers.get("X-Export-Warnings");
    if (warnings) {
      toast.warning(warnings);
    }

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `book-${bookId}-export.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("CSV downloaded");
  }

  async function markExported() {
    await fetch(`/api/books/${bookId}/export`, { method: "POST" });
    setExported(true);
    toast.success("Marked as exported");
  }

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
        {exportableLines.toLocaleString()} lines will export
        {excludedCount > 0 && (
          <>
            {" "}
            ({excludedCount.toLocaleString()} marked skip export in{" "}
            <Link href={`/books/${bookId}/manuscript`} className="text-teal hover:underline">
              manuscript studio
            </Link>
            )
          </>
        )}
        {totalLines !== exportableLines && totalLines > 0 && "."}
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Speaker</TableHead>
                <TableHead>Voice</TableHead>
                <TableHead>Line</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewLines.map((l, i) => (
                <TableRow key={i}>
                  <TableCell>{l.speaker}</TableCell>
                  <TableCell className="text-slate">{l.voice}</TableCell>
                  <TableCell className="truncate max-w-xs">{l.line}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {previewLines.length >= 50 && (
            <p className="mt-2 text-body-sm text-slate">
              Showing first 50 exportable lines (skipped lines omitted). Full export
              in CSV.
            </p>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <Button
                className="w-full"
                onClick={() => downloadCsv(false)}
                disabled={downloading}
              >
                {downloading ? "Generating…" : "Generate CSV"}
              </Button>
              {validationWarnings.length > 0 && (
                <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm space-y-2">
                  {validationWarnings.map((w, i) => (
                    <p key={i}>{w}</p>
                  ))}
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-2"
                    onClick={() => downloadCsv(true)}
                  >
                    Download anyway
                  </Button>
                </div>
              )}
              <p className="text-xs text-slate">
                CSV lines include series pronunciation dictionary and any
                per-line spoken overrides from proofread. Import into ElevenLabs
                Studio with speakers matching canonical names.
              </p>
              {!exported && (
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={markExported}
                >
                  Mark as exported
                </Button>
              )}
              {exported && (
                <div className="rounded-lg bg-sage/15 p-4 text-sm text-success">
                  Exported. Download ready above.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
