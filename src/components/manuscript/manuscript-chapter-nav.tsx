"use client";

import { ChevronLeft, ChevronRight, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  MANUSCRIPT_FULL_ID,
  type ManuscriptChapter,
} from "@/lib/manuscript/chapters";

export function ManuscriptChapterNav({
  chapters,
  activeChapterId,
  onChapterChange,
  onRebuildFromHeadings,
  rebuildBusy,
  className,
}: {
  chapters: ManuscriptChapter[];
  activeChapterId: string;
  onChapterChange: (chapterId: string) => void;
  onRebuildFromHeadings?: () => void;
  rebuildBusy?: boolean;
  className?: string;
}) {
  const isFullBook = activeChapterId === MANUSCRIPT_FULL_ID;
  const activeIndex = chapters.findIndex((c) => c.id === activeChapterId);
  const active = activeIndex >= 0 ? chapters[activeIndex] : null;
  const prev = isFullBook
    ? chapters[chapters.length - 1]
    : activeIndex > 0
      ? chapters[activeIndex - 1]
      : null;
  const next = isFullBook
    ? chapters[0]
    : activeIndex >= 0 && activeIndex < chapters.length - 1
      ? chapters[activeIndex + 1]
      : null;

  if (chapters.length === 0) return null;

  return (
    <aside
      className={cn(
        "shrink-0 flex flex-col gap-3 w-full lg:w-48 lg:self-stretch border border-border-muted rounded-lg bg-warm-sand/30 p-3",
        className
      )}
    >
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate">
        <List className="h-3.5 w-3.5" />
        Chapters
      </div>

      <div>
        <Label className="text-xs">Jump to</Label>
        <Select value={activeChapterId} onValueChange={onChapterChange}>
          <SelectTrigger className="mt-1 h-9 text-xs">
            <SelectValue placeholder="Select chapter" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value={MANUSCRIPT_FULL_ID}>
              Entire manuscript
            </SelectItem>
            {chapters.map((ch, i) => (
              <SelectItem key={ch.id} value={ch.id}>
                {i + 1}. {ch.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isFullBook ? (
        <p className="text-[11px] text-slate leading-snug">
          Scroll the full book · {chapters.length} chapters detected
        </p>
      ) : (
        active && (
          <p className="text-[11px] text-slate leading-snug">
            Lines #{active.startLineOrder.toLocaleString()}–
            {active.endLineOrder.toLocaleString()} ·{" "}
            {active.lineCount.toLocaleString()} lines
          </p>
        )
      )}

      {onRebuildFromHeadings && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-full text-xs justify-start"
          disabled={rebuildBusy}
          onClick={onRebuildFromHeadings}
        >
          {rebuildBusy ? "Rebuilding…" : "Rebuild from headings"}
        </Button>
      )}

      <div className="flex gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1 h-8 text-xs px-2"
          disabled={!prev}
          onClick={() => prev && onChapterChange(prev.id)}
        >
          <ChevronLeft className="h-3.5 w-3.5 mr-0.5" />
          Prev
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1 h-8 text-xs px-2"
          disabled={!next}
          onClick={() => next && onChapterChange(next.id)}
        >
          Next
          <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
        </Button>
      </div>

      <ul className="hidden lg:block flex-1 min-h-0 overflow-y-auto space-y-0.5 text-xs">
        <li>
          <button
            type="button"
            onClick={() => onChapterChange(MANUSCRIPT_FULL_ID)}
            className={cn(
              "w-full text-left rounded px-2 py-1.5 hover:bg-bone/80 transition-colors",
              isFullBook && "bg-bone font-medium text-ink"
            )}
          >
            Entire manuscript
          </button>
        </li>
        {chapters.map((ch, i) => (
          <li key={ch.id}>
            <button
              type="button"
              onClick={() => onChapterChange(ch.id)}
              className={cn(
                "w-full text-left rounded px-2 py-1.5 hover:bg-bone/80 transition-colors",
                ch.id === activeChapterId && "bg-bone font-medium text-ink"
              )}
            >
              <span className="text-slate tabular-nums">{i + 1}.</span>{" "}
              <span className="line-clamp-2">{ch.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
