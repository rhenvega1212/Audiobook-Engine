"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ManuscriptChapterNav } from "@/components/manuscript/manuscript-chapter-nav";
import {
  buildDocumentBlocks,
  type DocumentBlock,
} from "@/lib/manuscript/document-blocks";
import type { ManuscriptLine } from "@/lib/manuscript/types";
import {
  buildManuscriptChapters,
  filterLinesByChapter,
  MANUSCRIPT_FULL_ID,
} from "@/lib/manuscript/chapters";
import {
  chaptersFromRecords,
  type BookChapterRow,
} from "@/lib/books/book-chapters";

export function CleanupClient({
  bookId,
  bookTitle,
  initialLines,
  initialBookChapters = [],
}: {
  bookId: string;
  bookTitle: string;
  initialLines: ManuscriptLine[];
  initialBookChapters?: BookChapterRow[];
}) {
  const router = useRouter();
  const [lines, setLines] = useState(initialLines);
  const [bookChapters, setBookChapters] =
    useState<BookChapterRow[]>(initialBookChapters);
  const [chapterFilter, setChapterFilter] = useState(MANUSCRIPT_FULL_ID);
  const [search, setSearch] = useState("");
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(
    new Set()
  );
  const [busy, setBusy] = useState(false);
  const [retagOpen, setRetagOpen] = useState(false);
  const [retagAi, setRetagAi] = useState(false);
  const [retagProgress, setRetagProgress] = useState(0);
  const lastSelectedBlockRef = useRef<number | null>(null);
  const docRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLines(initialLines);
  }, [initialLines]);

  useEffect(() => {
    setBookChapters(initialBookChapters);
  }, [initialBookChapters]);

  const blocks = useMemo(() => buildDocumentBlocks(lines), [lines]);

  const chapters = useMemo(() => {
    if (bookChapters.length > 0) {
      return chaptersFromRecords(bookChapters, lines);
    }
    return buildManuscriptChapters(lines);
  }, [bookChapters, lines]);

  const activeChapter = useMemo(() => {
    if (chapterFilter === MANUSCRIPT_FULL_ID) return null;
    return chapters.find((c) => c.id === chapterFilter) ?? null;
  }, [chapters, chapterFilter]);

  const chapterLineIds = useMemo(() => {
    if (!activeChapter) return null;
    const scoped = filterLinesByChapter(lines, activeChapter);
    return new Set(scoped.map((l) => l.id));
  }, [lines, activeChapter]);

  const filteredBlocks = useMemo(() => {
    let result = blocks;
    if (chapterLineIds) {
      result = result.filter((b) =>
        b.line_ids.some((id) => chapterLineIds.has(id))
      );
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((b) => b.text.toLowerCase().includes(q));
    }
    return result;
  }, [blocks, chapterLineIds, search]);

  const stats = useMemo(
    () => ({
      paragraphs: blocks.length,
      lines: lines.length,
      showing: filteredBlocks.length,
      chapters: chapters.filter((c) => c.id !== MANUSCRIPT_FULL_ID).length,
    }),
    [blocks.length, lines.length, filteredBlocks.length, chapters]
  );

  const selectedLineIds = useMemo(() => {
    const ids: string[] = [];
    for (const block of filteredBlocks) {
      if (selectedBlockIds.has(block.id)) ids.push(...block.line_ids);
    }
    return ids;
  }, [filteredBlocks, selectedBlockIds]);

  const handleSelectBlock = useCallback(
    (block: DocumentBlock, index: number, shiftKey: boolean) => {
      if (shiftKey && lastSelectedBlockRef.current != null) {
        const from = Math.min(lastSelectedBlockRef.current, index);
        const to = Math.max(lastSelectedBlockRef.current, index);
        setSelectedBlockIds((prev) => {
          const next = new Set(prev);
          for (let i = from; i <= to; i++) {
            next.add(filteredBlocks[i]!.id);
          }
          return next;
        });
      } else {
        setSelectedBlockIds((prev) => {
          const next = new Set(prev);
          if (next.has(block.id)) next.delete(block.id);
          else next.add(block.id);
          return next;
        });
      }
      lastSelectedBlockRef.current = index;
    },
    [filteredBlocks]
  );

  function clearSelection() {
    setSelectedBlockIds(new Set());
    lastSelectedBlockRef.current = null;
  }

  function handleChapterChange(chapterId: string) {
    setChapterFilter(chapterId);
    clearSelection();
  }

  async function deleteSelected() {
    if (selectedLineIds.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/books/${bookId}/lines/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_ids: selectedLineIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "Delete failed");
      }
      const removed = new Set(selectedLineIds);
      setLines((prev) => prev.filter((l) => !removed.has(l.id)));
      clearSelection();
      toast.success(
        `Removed ${selectedLineIds.length.toLocaleString()} lines from the manuscript`
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function skipExportSelected(excluded: boolean) {
    if (selectedLineIds.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/books/${bookId}/lines/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          line_ids: selectedLineIds,
          excluded_from_export: excluded,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Update failed");
      }
      const idSet = new Set(selectedLineIds);
      setLines((prev) =>
        prev.map((l) =>
          idSet.has(l.id) ? { ...l, excluded_from_export: excluded } : l
        )
      );
      clearSelection();
      toast.success(
        excluded ? "Marked selection as skip export" : "Included in export"
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmRetag() {
    setBusy(true);
    setRetagProgress(12);
    const tick = window.setInterval(() => {
      setRetagProgress((p) => (p < 88 ? p + 6 : p));
    }, 400);

    try {
      const res = await fetch(`/api/books/${bookId}/retag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_ai_review: retagAi }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "Re-tag failed");
      }
      setRetagProgress(100);
      toast.success(
        `Assigned readers — ${(data as { total_lines?: number }).total_lines?.toLocaleString() ?? "?"} lines, ${(data as { flagged_count?: number }).flagged_count?.toLocaleString() ?? "?"} flagged`
      );
      setRetagOpen(false);
      router.push(`/books/${bookId}/manuscript`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Re-tag failed");
    } finally {
      window.clearInterval(tick);
      setBusy(false);
      setRetagProgress(0);
    }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === "Escape") clearSelection();
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedBlockIds.size > 0
      ) {
        e.preventDefault();
        void deleteSelected();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-7xl mx-auto w-full px-2 sm:px-0">
      <div className="shrink-0 pb-4">
        <Link
          href={`/books/${bookId}`}
          className="text-body-sm text-slate hover:text-ink"
        >
          ← {bookTitle}
        </Link>
        <h1 className="font-serif text-h2 mt-2">Manuscript cleanup</h1>
        <p className="text-body-sm text-slate mt-1 max-w-3xl">
          Read the book like a document. Click paragraphs to select — recipes,
          back matter, and other-books lists — then delete. When the text is
          clean, assign readers to split dialogue and tag speakers.
        </p>
        <p className="text-body-sm text-slate mt-2">
          {stats.lines.toLocaleString()} lines · {stats.paragraphs.toLocaleString()}{" "}
          paragraphs · showing {stats.showing.toLocaleString()}
          {stats.chapters > 0 && ` · ${stats.chapters} chapters`}
          {activeChapter && ` · ${activeChapter.title}`}
        </p>

        <div className="mt-3 flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[12rem] max-w-md">
            <Label htmlFor="cleanup-search" className="text-xs">
              Search
            </Label>
            <Input
              id="cleanup-search"
              className="mt-1 h-9"
              placeholder="Find text to remove…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button asChild variant="outline" size="sm" className="h-9">
            <Link href={`/books/${bookId}/manuscript`}>Speaker studio →</Link>
          </Button>
          <Button
            size="sm"
            className="h-9"
            disabled={busy || lines.length === 0}
            onClick={() => setRetagOpen(true)}
          >
            Assign readers & split lines
          </Button>
        </div>
      </div>

      {selectedBlockIds.size > 0 && (
        <div className="sticky top-0 z-40 shrink-0 mb-2 rounded-lg border border-burgundy/30 bg-cream px-3 py-2 flex flex-wrap items-center gap-2 shadow-sm">
          <p className="text-body-sm font-medium">
            {selectedBlockIds.size} paragraph
            {selectedBlockIds.size === 1 ? "" : "s"} selected (
            {selectedLineIds.length.toLocaleString()} lines)
          </p>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-dark-red border-dark-red/40"
            disabled={busy}
            onClick={() => void deleteSelected()}
          >
            Delete
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-8"
            disabled={busy}
            onClick={() => void skipExportSelected(true)}
          >
            Skip export
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={clearSelection}
          >
            Clear
          </Button>
        </div>
      )}

      <div className="flex flex-1 min-h-0 gap-4 flex-col lg:flex-row">
        {lines.length > 0 && (
          <ManuscriptChapterNav
            chapters={chapters}
            activeChapterId={chapterFilter}
            onChapterChange={handleChapterChange}
          />
        )}

        <div
          ref={docRef}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain rounded-lg border border-border-muted bg-cream px-4 sm:px-8 py-6"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <article className="max-w-3xl mx-auto font-serif text-[1.05rem] leading-relaxed text-ink selection:bg-burgundy/20">
            {filteredBlocks.length === 0 ? (
              <p className="text-slate text-body-sm">No paragraphs match.</p>
            ) : (
              filteredBlocks.map((block, index) => {
                const selected = selectedBlockIds.has(block.id);
                return (
                  <p
                    key={block.id}
                    role="button"
                    tabIndex={0}
                    onClick={(e) =>
                      handleSelectBlock(block, index, e.shiftKey)
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleSelectBlock(block, index, e.shiftKey);
                      }
                    }}
                    className={`mb-4 cursor-pointer rounded-sm px-1 -mx-1 transition-colors ${
                      block.isHeading
                        ? "text-xl font-semibold mt-8 first:mt-0"
                        : ""
                    } ${
                      selected
                        ? "bg-burgundy/15 ring-1 ring-burgundy/40"
                        : block.excluded_from_export
                          ? "opacity-50 line-through decoration-slate/40"
                          : "hover:bg-warm-sand/40"
                    }`}
                  >
                    {block.text}
                  </p>
                );
              })
            )}
          </article>
        </div>
      </div>

      <Dialog open={retagOpen} onOpenChange={(o) => !busy && setRetagOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign readers & split lines?</DialogTitle>
            <DialogDescription>
              This splits dialogue, assigns speakers, and rebuilds chapters from
              the <strong>{stats.paragraphs.toLocaleString()} paragraphs</strong>{" "}
              left in your manuscript. Your deletions are kept — the original
              Word file is not re-imported.
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-center gap-2 text-body-sm cursor-pointer">
            <input
              type="checkbox"
              checked={retagAi}
              onChange={(e) => setRetagAi(e.target.checked)}
              className="rounded"
            />
            Also run AI review on flagged lines (slower)
          </label>
          {busy && (
            <div className="space-y-2">
              <Progress value={retagProgress} className="h-2" />
              <p className="text-body-sm text-slate">Tagging speakers…</p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" disabled={busy} onClick={() => setRetagOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void confirmRetag()}>
              {busy ? "Working…" : "Assign readers"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
