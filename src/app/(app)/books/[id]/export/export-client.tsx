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
}: {
  bookId: string;
  bookTitle: string;
  status: string;
  previewLines: { speaker: string; voice: string; line: string }[];
}) {
  const [exported, setExported] = useState(status === "exported");

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
              Showing first 50 lines. Full export in CSV.
            </p>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <Button asChild className="w-full">
                <a href={`/api/books/${bookId}/export`} download>
                  Generate CSV
                </a>
              </Button>
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
