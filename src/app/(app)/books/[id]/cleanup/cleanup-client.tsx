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
import { Loader2 } from "lucide-react";
import { ManuscriptChapterNav } from "@/components/manuscript/manuscript-chapter-nav";
import { VirtualManuscriptList } from "@/components/manuscript/virtual-manuscript-list";
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
import { UndoEditButton } from "@/components/manuscript/undo-edit-button";
import { useManuscriptUndo } from "@/lib/manuscript/use-manuscript-undo";

export function CleanupClient({
  bookId,
  bookTitle,
}: {
  bookId: string;
  bookTitle: string;
}) {
  const router = useRouter();
  const { undoCount, undoBusy, applyUndo, refreshUndoCount } = useManuscriptUndo(
    bookId,
    0
  );
  const [lines, setLines] = useState<ManuscriptLine[]>([]);
  const [bookChapters, setBookChapters] = useState<BookChapterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chapterFilter, setChapterFilter] = useState(MANUSCRIPT_FULL_ID);
  const [search, setSearch] = useState("");
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(
    new Set()
  );
  const [busy, setBusy] = useState(false);
  const lastSelectedBlockRef = useRef<number | null>(null);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [savingBlockId, setSavingBlockId] = useState<string | null>(null);
  // Guards the textarea's onBlur save: set when we close the editor
  // programmatically (Esc / successful save) so removing the focused element
  // does not fire a second, unintended save (which could wipe the paragraph).
  const closingEditRef = useRef(false);

  const loadManuscript = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/books/${bookId}/cleanup`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "Failed to load");
      }
      const payload = data as { lines?: ManuscriptLine[]; chapters?: BookChapterRow[] };
      setLines(Array.isArray(payload.lines) ? payload.lines : []);
      setBookChapters(Array.isArray(payload.chapters) ? payload.chapters : []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load manuscript");
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    void loadManuscript();
    void refreshUndoCount();
  }, [loadManuscript, refreshUndoCount]);

  async function handleUndo() {
    const ok = await applyUndo();
    if (ok) void loadManuscript();
  }

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

  function startEditing(block: DocumentBlock) {
    if (busy) return;
    closingEditRef.current = false;
    setEditingBlockId(block.id);
    setEditingText(block.text);
  }

  function cancelEditing() {
    closingEditRef.current = true;
    setEditingBlockId(null);
    setEditingText("");
  }

  async function commitParagraph(block: DocumentBlock) {
    if (savingBlockId) return;
    const newText = editingText;
    if (newText.trim() === block.text.trim()) {
      cancelEditing();
      return;
    }
    setSavingBlockId(block.id);
    try {
      const res = await fetch(`/api/books/${bookId}/lines/edit-paragraph`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_ids: block.line_ids, text: newText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "Save failed");
      }
      const {
        kept_line_id,
        deleted_line_ids,
        line_text,
        chapters,
      } = data as {
        kept_line_id: string | null;
        deleted_line_ids: string[];
        line_text: string;
        chapters?: BookChapterRow[];
      };
      const deleted = new Set(deleted_line_ids ?? []);
      setLines((prev) => {
        let next = prev.filter((l) => !deleted.has(l.id));
        if (kept_line_id) {
          next = next.map((l) =>
            l.id === kept_line_id ? { ...l, line_text } : l
          );
        }
        return next
          .sort((a, b) => a.line_order - b.line_order)
          .map((l, i) => ({ ...l, line_order: i }));
      });
      if (chapters) setBookChapters(chapters);
      cancelEditing();
      void refreshUndoCount();
      if (kept_line_id === null) toast.success("Paragraph removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingBlockId(null);
    }
  }

  function handleEditorBlur(block: DocumentBlock) {
    if (closingEditRef.current) {
      closingEditRef.current = false;
      return;
    }
    void commitParagraph(block);
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
      setLines((prev) =>
        prev
          .filter((l) => !removed.has(l.id))
          .sort((a, b) => a.line_order - b.line_order)
          .map((l, i) => ({ ...l, line_order: i }))
      );
      const chapters = (data as { chapters?: BookChapterRow[] }).chapters;
      if (chapters) setBookChapters(chapters);
      clearSelection();
      toast.success(
        `Removed ${selectedLineIds.length.toLocaleString()} lines from the manuscript`
      );
      void refreshUndoCount();
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
      void refreshUndoCount();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
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
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "z" &&
        !e.shiftKey
      ) {
        e.preventDefault();
        void handleUndo();
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
        <h1 className="font-serif text-h2 mt-2">Manuscript editor</h1>
        <p className="text-body-sm text-slate mt-1 max-w-3xl">
          Edit the book like a document. Click any paragraph to rewrite, retype,
          or delete text — cut, copy, and paste work as usual. Use the checkbox
          on the left to select paragraphs (recipes, back matter, other-books
          lists) for bulk delete or skip. When the text is clean, open Speaker
          studio to refine speakers with AI and manual review.
        </p>
        <p className="text-body-sm text-slate mt-2">
          {loading
            ? "Loading manuscript…"
            : `${stats.lines.toLocaleString()} lines · ${stats.paragraphs.toLocaleString()} paragraphs · showing ${stats.showing.toLocaleString()}${stats.chapters > 0 ? ` · ${stats.chapters} chapters` : ""}${activeChapter ? ` · ${activeChapter.title}` : ""}`}
        </p>

        <div className="mt-3 flex flex-wrap gap-2 items-end">
          <UndoEditButton
            undoCount={undoCount}
            busy={undoBusy}
            onUndo={() => void handleUndo()}
          />
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
          <Button asChild size="sm" className="h-9">
            <Link href={`/books/${bookId}/manuscript`}>Speaker studio →</Link>
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

        <div className="flex-1 min-h-0 rounded-lg border border-border-muted bg-cream px-4 sm:px-8 py-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate">
              <Loader2 className="h-7 w-7 animate-spin text-teal" />
              <p className="text-body-sm">Loading paragraphs…</p>
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate">
              <p className="text-body-sm text-dark-red">{loadError}</p>
              <Button size="sm" variant="outline" onClick={() => void loadManuscript()}>
                Retry
              </Button>
            </div>
          ) : filteredBlocks.length === 0 ? (
            <p className="text-slate text-body-sm text-center py-12">
              No paragraphs match.
            </p>
          ) : (
            <VirtualManuscriptList
              className="h-full"
              items={filteredBlocks}
              scrollKey={`${chapterFilter}-${search}`}
              scrollToIndex={0}
              rowHeight={72}
              renderRow={(block, index) => {
                const selected = selectedBlockIds.has(block.id);
                const editing = editingBlockId === block.id;
                const saving = savingBlockId === block.id;
                const multiLine = block.line_ids.length > 1;
                return (
                  <article className="group max-w-3xl mx-auto font-serif text-[1.05rem] leading-relaxed text-ink selection:bg-burgundy/20">
                    <div
                      className={`flex items-start gap-2 mb-4 ${
                        block.isHeading ? "mt-8 first:mt-0" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        aria-label="Select paragraph"
                        onClick={(e) =>
                          handleSelectBlock(block, index, e.shiftKey)
                        }
                        onChange={() => {}}
                        className={`mt-2 h-4 w-4 shrink-0 cursor-pointer accent-burgundy transition-opacity ${
                          selected
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-100 focus:opacity-100"
                        }`}
                      />
                      {editing ? (
                        <div className="flex-1 min-w-0">
                          <textarea
                            autoFocus
                            value={editingText}
                            disabled={saving}
                            onChange={(e) => setEditingText(e.target.value)}
                            ref={(el) => {
                              if (el) {
                                el.style.height = "auto";
                                el.style.height = `${el.scrollHeight}px`;
                              }
                            }}
                            onInput={(e) => {
                              const el = e.currentTarget;
                              el.style.height = "auto";
                              el.style.height = `${el.scrollHeight}px`;
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                e.preventDefault();
                                cancelEditing();
                              } else if (
                                e.key === "Enter" &&
                                (e.metaKey || e.ctrlKey)
                              ) {
                                e.preventDefault();
                                void commitParagraph(block);
                              }
                            }}
                            onBlur={() => handleEditorBlur(block)}
                            className={`w-full resize-none overflow-hidden rounded-md border border-burgundy/40 bg-white px-3 py-2 font-serif leading-relaxed text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-burgundy/30 ${
                              block.isHeading
                                ? "text-xl font-semibold"
                                : "text-[1.05rem]"
                            }`}
                          />
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate">
                            {saving ? (
                              <span className="inline-flex items-center gap-1">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Saving…
                              </span>
                            ) : (
                              <span>⌘/Ctrl+Enter to save · Esc to cancel</span>
                            )}
                            {multiLine && !saving && (
                              <span className="text-burgundy/80">
                                Merges {block.line_ids.length} lines into one
                                voice
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p
                          role="button"
                          tabIndex={0}
                          onClick={() => startEditing(block)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              startEditing(block);
                            }
                          }}
                          className={`flex-1 min-w-0 cursor-text rounded-sm px-1 -mx-1 whitespace-pre-wrap transition-colors ${
                            block.isHeading ? "text-xl font-semibold" : ""
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
                      )}
                    </div>
                  </article>
                );
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
