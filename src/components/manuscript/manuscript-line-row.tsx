"use client";

import { useRef } from "react";
import { Loader2, Play, Volume2 } from "lucide-react";
import {
  getTextSelectionInElement,
  type TextSelectionPayload,
} from "@/lib/manuscript/text-selection";
import type { ManuscriptLine } from "@/lib/manuscript/types";
import { Button } from "@/components/ui/button";
import {
  SpeakerSelect,
  resolveSpeakerIdFromLine,
  type SpeakerCharacter,
} from "@/components/books/speaker-select";
import type { Character } from "@/lib/types/database";

export function ManuscriptLineRow({
  bookId,
  line,
  characters,
  onCharacterCreated,
  isSelected,
  isHighlighted,
  isSaving,
  isPlaying,
  isPlayLoading,
  onSelect,
  onSpeakerChange,
  onToggleExclude,
  onClearFlag,
  onPlay,
  onCastVoice,
  onTextSelected,
  selectionEnabled = false,
  isChapterStart = false,
  speechTagAfter,
}: {
  bookId: string;
  line: ManuscriptLine;
  characters: Pick<Character, "id" | "canonical_name" | "aliases">[];
  onCharacterCreated?: (character: SpeakerCharacter) => void;
  isSelected: boolean;
  isHighlighted: boolean;
  isSaving: boolean;
  isPlaying: boolean;
  isPlayLoading: boolean;
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
  onTextSelected?: (payload: TextSelectionPayload) => void;
  selectionEnabled?: boolean;
  isChapterStart?: boolean;
  /** Speech tag from Word source when not stored as its own line (e.g. "Nikki said."). */
  speechTagAfter?: string | null;
}) {
  const textRef = useRef<HTMLParagraphElement>(null);
  const speakerValue = resolveSpeakerIdFromLine(
    line.speaker_label,
    line.speaker_character_id,
    characters as SpeakerCharacter[]
  );
  const isFlagged = !!line.flag_reason;
  const excluded = line.excluded_from_export;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => onSelect(line.id, e.shiftKey)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(line.id, e.shiftKey);
        }
      }}
      className={`rounded-md px-3 py-2 transition-colors cursor-pointer border-l-4 ${
        isHighlighted
          ? "bg-teal/15 border-l-teal ring-1 ring-teal/30"
          : isSelected
            ? "bg-burgundy/10 border-l-burgundy"
            : excluded
              ? "bg-slate/10 border-l-slate/40 opacity-70"
              : isFlagged
                ? "bg-warning/5 border-l-warning/60"
                : "bg-warm-sand/25 border-l-transparent hover:bg-warm-sand/50"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 mb-1.5">
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
          disabled={isSaving}
          value={speakerValue}
          characters={characters as SpeakerCharacter[]}
          onCharacterCreated={onCharacterCreated}
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
            disabled={isSaving}
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
            disabled={isSaving}
            onClick={(e) => {
              e.stopPropagation();
              onClearFlag(line);
            }}
          >
            Clear flag
          </Button>
        )}
        {isSaving && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-slate shrink-0" />
        )}
      </div>

      <p
        ref={textRef}
        className={`font-serif text-sm break-words whitespace-pre-wrap pl-6 select-text ${
          excluded ? "line-through text-slate" : "text-ink"
        } ${selectionEnabled ? "cursor-text" : ""}`}
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
      {speechTagAfter && (
        <p className="font-serif text-sm text-slate italic pl-6 -mt-0.5 mb-0.5">
          {speechTagAfter}
        </p>
      )}

      {isFlagged && line.flag_reason && (
        <p className="mt-1 pl-6 text-[10px] text-slate italic">{line.flag_reason}</p>
      )}
    </div>
  );
}
