"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TaggedLine } from "@/lib/types/database";

export function LineReviewClient({
  bookId,
  bookTitle,
  allLines,
  flaggedLines,
  characters,
  initialReviewed,
}: {
  bookId: string;
  bookTitle: string;
  allLines: TaggedLine[];
  flaggedLines: TaggedLine[];
  characters: { id: string; canonical_name: string }[];
  initialReviewed: number;
}) {
  const router = useRouter();
  const [queue, setQueue] = useState(
    flaggedLines.filter((l) => !l.human_reviewed)
  );
  const [reviewed, setReviewed] = useState(initialReviewed);
  const [speakerId, setSpeakerId] = useState<string>("");
  const [spokenText, setSpokenText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const current = queue[0];
  const total = flaggedLines.length;
  const progress = total > 0 ? (reviewed / total) * 100 : 100;

  const currentIndex = current
    ? allLines.findIndex((l) => l.id === current.id)
    : -1;

  const contextBefore = allLines.slice(
    Math.max(0, currentIndex - 3),
    currentIndex
  );
  const contextAfter = allLines.slice(currentIndex + 1, currentIndex + 4);

  useEffect(() => {
    if (current) {
      const match = characters.find(
        (c) => c.canonical_name === current.speaker_label
      );
      setSpeakerId(match?.id ?? "");
      setSpokenText(current.spoken_text ?? "");
    }
  }, [current, characters]);

  const advance = useCallback(() => {
    setQueue((q) => q.slice(1));
    setReviewed((r) => r + 1);
  }, []);

  async function confirmLine() {
    if (!current) return;
    const char = characters.find((c) => c.id === speakerId);
    await fetch(`/api/books/${bookId}/lines/${current.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        speaker_character_id: speakerId || null,
        speaker_label: char?.canonical_name ?? current.speaker_label,
        spoken_text: spokenText.trim() || null,
        human_reviewed: true,
      }),
    });
    advance();
  }

  async function skipLine() {
    if (!current) return;
    await fetch(`/api/books/${bookId}/lines/${current.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ human_reviewed: true }),
    });
    advance();
  }

  async function aiSuggestion() {
    if (!current) return;
    setAiLoading(true);
    const res = await fetch(`/api/books/${bookId}/ai-review`, {
      method: "POST",
    });
    setAiLoading(false);
    if (!res.ok) {
      toast.error("AI suggestion failed");
      return;
    }
    router.refresh();
    toast.success("AI review applied — refresh to see updates");
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
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "Enter") {
        e.preventDefault();
        confirmLine();
      } else if (e.key === "s" || e.key === "S") {
        skipLine();
      } else if (e.key === "a" || e.key === "A") {
        aiSuggestion();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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

      <div className="space-y-2 mb-4">
        {contextBefore.map((l) => (
          <p key={l.id} className="text-body-sm text-slate/90 pl-2">
            <span className="font-medium">{l.speaker_label}:</span>{" "}
            {l.line_text.slice(0, 100)}
          </p>
        ))}
      </div>

      <Card className="border-l-4 border-l-teal p-4 mb-4">
        <p className="text-xs uppercase tracking-wider text-slate mb-2">
          Current: {current.speaker_label}
          {current.flag_reason && (
            <span className="ml-2 normal-case">({current.flag_reason})</span>
          )}
        </p>
        <p className="font-serif text-base">{current.line_text}</p>
      </Card>

      <div className="space-y-2 mb-6">
        {contextAfter.map((l) => (
          <p key={l.id} className="text-body-sm text-slate/90 pl-2">
            <span className="font-medium">{l.speaker_label}:</span>{" "}
            {l.line_text.slice(0, 100)}
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
        <Select value={speakerId} onValueChange={setSpeakerId}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Select speaker" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="narrator">Narrator</SelectItem>
            {characters.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.canonical_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={confirmLine}>Confirm (Enter)</Button>
        <Button variant="ghost" onClick={skipLine}>
          Skip (S)
        </Button>
        <Button
          variant="secondary"
          onClick={aiSuggestion}
          disabled={aiLoading}
        >
          AI batch review (A)
        </Button>
      </div>

      <Button
        variant="outline"
        className="mt-8 w-full"
        onClick={markAllConfirmed}
      >
        Mark all unreviewed as confirmed
      </Button>
    </div>
  );
}
