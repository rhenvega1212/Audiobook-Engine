"use client";

import { useEffect, useRef, useState } from "react";
import { GripVertical, Loader2, Play, Volume2 } from "lucide-react";
import {
  getTextSelectionInElement,
  type TextSelectionPayload,
} from "@/lib/manuscript/text-selection";
import type { ManuscriptLine } from "@/lib/manuscript/types";
import { lineNeedsHumanReview } from "@/lib/books/flagged-lines";
import { Button } from "@/components/ui/button";
import {
  SpeakerSelect,
  resolveSpeakerIdFromLine,
  type SpeakerCharacter,
} from "@/components/books/speaker-select";
import type { Character } from "@/lib/types/database";

function resizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

export function ManuscriptLineRow({
  bookId,
  line,
  characters,
  onCharacterCreated,
  onCharacterDeleted,
  onCharacterMerged,
  isSelected,
  isHighlighted,
  isSaving,
  isPlaying,
  isPlayLoading,
  onHighlight,
  onSelect,
  onSpeakerChange,
  onToggleExclude,
  onClearFlag,
  onPlay,
  onCastVoice,
  onLineTextSave,
  onTextSelected,
  selectionEnabled = false,
  reorderEnabled = false,
  isDragging = false,
  isDragOver = false,
  onReorderDragStart,
  onReorderDragEnd,
  onReorderDragOver,
  onReorderDrop,
  isChapterStart = false,
  speechTagAfter,
}: {
  bookId: string;
  line: ManuscriptLine;
  characters: Pick<Character, "id" | "canonical_name" | "aliases">[];
  onCharacterCreated?: (character: SpeakerCharacter) => void;
  onCharacterDeleted?: (characterId: string) => void;
  onCharacterMerged?: (sourceId: string, targetId: string) => void;
  isSelected: boolean;
  isHighlighted: boolean;
  isSaving: boolean;
  isPlaying: boolean;
  isPlayLoading: boolean;
  onHighlight: (lineId: string) => void;
  onSelect: (lineId: string, shiftKey: boolean) => void;
  onSpeakerChange: (
    line: ManuscriptLine,
    speakerValue: string,
    character?: SpeakerCharacter
  ) => void;
  onToggleExclude: (line: ManuscriptLine) => void;
  onClearFlag: (line: ManuscriptLine) => void;
  onPlay: (line: ManuscriptLine) => void;
  onCastVoice: (line: ManuscriptLine) => void;
  onLineTextSave?: (line: ManuscriptLine, lineText: string) => Promise<void>;
  onTextSelected?: (payload: TextSelectionPayload) => void;
  reorderEnabled?: boolean;
  isDragging?: boolean;
  isDragOver?: boolean;
  onReorderDragStart?: (lineId: string) => void;
  onReorderDragEnd?: () => void;
  onReorderDragOver?: (lineId: string) => void;
  onReorderDrop?: (lineId: string) => void;
  selectionEnabled?: boolean;
  isChapterStart?: boolean;
  /** Speech tag from Word source when not stored as its own line (e.g. "Nikki said."). */
  speechTagAfter?: string | null;
}) {
  const textRef = useRef<HTMLParagraphElement>(null);
  const closingEditRef = useRef(false);
  const [editingText, setEditingText] = useState(false);
  const [draftText, setDraftText] = useState(line.line_text);
  const [savingText, setSavingText] = useState(false);
  const speakerValue = resolveSpeakerIdFromLine(
    line.speaker_label,
    line.speaker_character_id,
    characters as SpeakerCharacter[]
  );
  const isFlagged = lineNeedsHumanReview(line);
  const excluded = line.excluded_from_export;
  const canEditText = !!onLineTextSave;

  useEffect(() => {
    if (!editingText) {
      setDraftText(line.line_text);
    }
  }, [line.line_text, editingText]);

  function startTextEditing() {
    if (!canEditText || isSaving || savingText) return;
    closingEditRef.current = false;
    setDraftText(line.line_text);
    setEditingText(true);
    onHighlight(line.id);
  }

  function cancelTextEditing() {
    closingEditRef.current = true;
    setEditingText(false);
    setDraftText(line.line_text);
  }

  async function commitTextEditing() {
    if (!onLineTextSave || savingText) return;
    const trimmed = draftText.trim();
    if (trimmed === line.line_text.trim()) {
      cancelTextEditing();
      return;
    }
    if (!trimmed) {
      cancelTextEditing();
      return;
    }
    setSavingText(true);
    try {
      await onLineTextSave(line, trimmed);
      closingEditRef.current = true;
      setEditingText(false);
    } finally {
      setSavingText(false);
    }
  }

  function handleEditorBlur() {
    if (closingEditRef.current) {
      closingEditRef.current = false;
      return;
    }
    void commitTextEditing();
  }

  return (
    <div
      className={`relative rounded-md px-3 py-2.5 transition-colors border-l-4 ${
        isDragOver
          ? "ring-2 ring-burgundy/50 ring-inset"
          : ""
      } ${
        isDragging
          ? "opacity-40"
          : editingText
            ? "bg-white border-l-burgundy ring-1 ring-burgundy/25"
            : isHighlighted
          ? "bg-teal/15 border-l-teal ring-1 ring-teal/30"
          : isSelected
            ? "bg-burgundy/10 border-l-burgundy"
            : excluded
              ? "bg-slate/10 border-l-slate/40 opacity-70"
              : isFlagged
                ? "bg-warning/5 border-l-warning/60"
                : "bg-warm-sand/25 border-l-transparent hover:bg-warm-sand/50"
      }`}
      onDragOver={(e) => {
        if (!reorderEnabled) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onReorderDragOver?.(line.id);
      }}
      onDrop={(e) => {
        if (!reorderEnabled) return;
        e.preventDefault();
        onReorderDrop?.(line.id);
      }}
    >
      {isDragOver && (
        <div
          className="absolute left-2 right-2 top-0 h-0.5 bg-burgundy rounded-full -translate-y-px pointer-events-none"
          aria-hidden
        />
      )}
      <div
        className="flex flex-wrap items-center gap-x-2 gap-y-1.5 mb-1.5"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {reorderEnabled && (
          <button
            type="button"
            draggable
            className="h-6 w-5 flex items-center justify-center shrink-0 cursor-grab active:cursor-grabbing text-slate/50 hover:text-burgundy touch-none"
            aria-label={`Drag to reorder line ${line.line_order}`}
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", line.id);
              e.dataTransfer.effectAllowed = "move";
              onReorderDragStart?.(line.id);
            }}
            onDragEnd={() => onReorderDragEnd?.()}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => {}}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(line.id, e.shiftKey);
          }}
          className="h-3.5 w-3.5 rounded border-slate/40 text-burgundy shrink-0"
          aria-label={`Select line ${line.line_order}`}
        />
        <span className="text-[10px] uppercase tracking-wider text-slate tabular-nums shrink-0 w-14">
          #{line.line_order.toLocaleString()}
        </span>
        {isChapterStart && (
          <span className="text-[9px] uppercase tracking-wider font-medium text-teal bg-teal/10 px-1.5 py-0.5 rounded">
            Ch.
          </span>
        )}

        <SpeakerSelect
          bookId={bookId}
          size="compact"
          includeUnknown
          disabled={isSaving || savingText}
          value={speakerValue}
          characters={characters as SpeakerCharacter[]}
          onCharacterCreated={onCharacterCreated}
          onCharacterDeleted={onCharacterDeleted}
          onCharacterMerged={onCharacterMerged}
          onTriggerClick={(e) => e.stopPropagation()}
          onValueChange={(value, character) =>
            onSpeakerChange(line, value, character)
          }
        />

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCastVoice(line);
          }}
          className="text-[11px] text-teal hover:underline truncate max-w-[10rem] sm:max-w-[14rem]"
          title="Change voice for this character"
        >
          {line.voice_name ? (
            <span className="inline-flex items-center gap-1">
              <Volume2 className="h-3 w-3 shrink-0" />
              {line.voice_name}
            </span>
          ) : (
            <span className="text-warning">No voice — cast</span>
          )}
        </button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 shrink-0"
          disabled={!line.voice_id || isPlayLoading}
          onClick={(e) => {
            e.stopPropagation();
            onPlay(line);
          }}
          title="Preview line"
        >
          {isPlayLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className={`h-3.5 w-3.5 ${isPlaying ? "text-teal" : ""}`} />
          )}
        </Button>

        <label
          className="ml-auto flex items-center gap-1.5 text-[10px] text-slate shrink-0 cursor-pointer"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={excluded}
            disabled={isSaving || savingText}
            onChange={() => onToggleExclude(line)}
            className="h-3.5 w-3.5 rounded border-slate/40"
          />
          Skip export
        </label>

        {isFlagged && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 text-[10px] px-2"
            disabled={isSaving || savingText}
            onClick={(e) => {
              e.stopPropagation();
              onClearFlag(line);
            }}
          >
            Clear flag
          </Button>
        )}
        {(isSaving || savingText) && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-slate shrink-0" />
        )}
      </div>

      <div className="pl-6">
        {editingText ? (
          <div>
            <textarea
              autoFocus
              value={draftText}
              disabled={savingText}
              onChange={(e) => setDraftText(e.target.value)}
              ref={(el) => resizeTextarea(el)}
              onInput={(e) => resizeTextarea(e.currentTarget)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  cancelTextEditing();
                } else if (
                  e.key === "Enter" &&
                  (e.metaKey || e.ctrlKey)
                ) {
                  e.preventDefault();
                  void commitTextEditing();
                }
              }}
              onBlur={handleEditorBlur}
              className={`w-full resize-none overflow-hidden rounded-md border border-burgundy/40 bg-white px-3 py-2 font-serif text-base leading-relaxed shadow-sm focus:outline-none focus:ring-2 focus:ring-burgundy/30 ${
                excluded ? "line-through text-slate" : "text-ink"
              }`}
            />
            <p className="mt-1 text-[10px] text-slate">
              {savingText ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Saving…
                </span>
              ) : (
                "⌘/Ctrl+Enter to save · Esc to cancel"
              )}
            </p>
          </div>
        ) : (
          <p
            ref={textRef}
            role="button"
            tabIndex={0}
            title={canEditText ? "Click to edit text" : undefined}
            onClick={(e) => {
              e.stopPropagation();
              if (canEditText) {
                startTextEditing();
              } else {
                onHighlight(line.id);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (canEditText) startTextEditing();
                else onHighlight(line.id);
              }
            }}
            className={`font-serif text-base leading-relaxed break-words whitespace-pre-wrap select-text ${
              canEditText ? "cursor-text" : "cursor-pointer"
            } ${
              excluded ? "line-through text-slate" : "text-ink"
            }`}
            onMouseUp={(e) => {
              e.stopPropagation();
              if (!selectionEnabled || !onTextSelected || !textRef.current) return;
              const offsets = getTextSelectionInElement(
                textRef.current,
                line.line_text
              );
              if (!offsets) return;
              const sel = window.getSelection();
              if (!sel?.rangeCount) return;
              const rect = sel.getRangeAt(0).getBoundingClientRect();
              onTextSelected({
                lineId: line.id,
                start: offsets.start,
                end: offsets.end,
                selectedText: offsets.selectedText,
                rect,
              });
            }}
          >
            {line.line_text}
          </p>
        )}
      </div>
      {speechTagAfter && !editingText && (
        <p className="font-serif text-base leading-relaxed text-slate italic pl-6 -mt-0.5 mb-0.5">
          {speechTagAfter}
        </p>
      )}

      {isFlagged && line.flag_reason && !editingText && (
        <p className="mt-1 pl-6 text-[10px] text-slate italic">{line.flag_reason}</p>
      )}
    </div>
  );
}
