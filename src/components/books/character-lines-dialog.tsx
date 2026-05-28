"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type CharacterLine = {
  id: string;
  line_order: number;
  line_text: string;
  flag_reason: string | null;
};

export function CharacterLinesDialog({
  bookId,
  characterName,
  open,
  onOpenChange,
}: {
  bookId: string;
  characterName: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<CharacterLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !characterName) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setLines([]);

    fetch(
      `/api/books/${bookId}/lines?speaker=${encodeURIComponent(characterName)}`
    )
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            (data as { error?: string }).error ?? "Failed to load lines"
          );
        }
        if (!cancelled) {
          setLines((data as { lines?: CharacterLine[] }).lines ?? []);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load lines");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [bookId, characterName, open]);

  function openInManuscript(lineId: string) {
    onOpenChange(false);
    router.push(
      `/books/${bookId}/manuscript?line=${encodeURIComponent(lineId)}`
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(85vh,calc(100vh-2rem))] max-w-2xl flex-col gap-0 overflow-hidden p-0 top-[50%] translate-y-[-50%]">
        <DialogHeader className="mb-0 shrink-0 !mx-0 !mt-0 rounded-t-lg pr-14">
          <DialogTitle className="text-xl text-bone [text-shadow:0_1px_3px_rgba(0,0,0,0.35)]">
            {characterName ?? "Character lines"}
          </DialogTitle>
          <DialogDescription>
            {loading
              ? "Loading lines…"
              : error
                ? error
                : `${lines.length.toLocaleString()} line${lines.length === 1 ? "" : "s"} in this book · click a line to see manuscript context`}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : error ? (
            <p className="py-8 text-center text-body-sm text-slate">{error}</p>
          ) : lines.length === 0 ? (
            <p className="py-8 text-center text-body-sm text-slate">
              No lines found for this character.
            </p>
          ) : (
            <ol className="divide-y divide-border-muted">
              {lines.map((line) => (
                <li key={line.id}>
                  <button
                    type="button"
                    onClick={() => openInManuscript(line.id)}
                    className="w-full py-3 text-left transition-colors rounded-sm hover:bg-warm-sand/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
                  >
                    <p className="font-mono text-[10px] text-slate mb-1">
                      Line {line.line_order.toLocaleString()}
                      {line.flag_reason && (
                        <span className="ml-2 text-warning">· flagged</span>
                      )}
                      <span className="ml-2 text-teal normal-case font-sans">
                        → view in manuscript
                      </span>
                    </p>
                    <p className="font-serif text-sm text-ink whitespace-pre-wrap break-words">
                      {line.line_text}
                    </p>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>

        {!loading && !error && lines.length > 0 && (
          <div className="shrink-0 border-t border-border px-6 py-3 bg-warm-sand/30">
            <div className="flex flex-col gap-2">
              <Button asChild variant="secondary" size="sm" className="w-full">
                <Link
                  href={`/books/${bookId}/manuscript?speaker=${encodeURIComponent(characterName ?? "")}`}
                >
                  Open in manuscript studio
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link
                  href={`/books/${bookId}/listen?speaker=${encodeURIComponent(characterName ?? "")}`}
                >
                  Listen to these lines
                </Link>
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
