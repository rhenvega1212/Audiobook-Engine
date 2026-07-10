"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Play, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SpeakerSelect,
  resolveSpeakerIdFromLine,
  type SpeakerCharacter,
} from "@/components/books/speaker-select";
import { CompactSpeakerBlock } from "@/components/manuscript/compact-speaker-block";
import type { Character } from "@/lib/types/database";
import type { ManuscriptLine } from "@/lib/manuscript/types";
import { lineNeedsHumanReview } from "@/lib/books/flagged-lines";
import type { SpeakerBlock } from "@/lib/manuscript/group-lines";

function resizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

export function ManuscriptCompactBlockRow({
  bookId,
  block,
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
  onPlay,
  onCastVoice,
  onBlockTextSave,
}: {
  bookId: string;
  block: SpeakerBlock<ManuscriptLine>;
  characters: Pick<Character, "id" | "canonical_name" | "aliases">[];
  onCharacterCreated?: (character: SpeakerCharacter) => void;
  onCharacterDeleted?: (characterId: string) => void;
  onCharacterMerged?: (sourceId: string, targetId: string) => void;
  isSelected: boolean;
  isHighlighted: boolean;
  isSaving: boolean;
  isPlaying: boolean;
  isPlayLoading: boolean;
  onHighlight: (block: SpeakerBlock<ManuscriptLine>) => void;
  onSelect: (block: SpeakerBlock<ManuscriptLine>, shiftKey: boolean) => void;
  onSpeakerChange: (
    block: SpeakerBlock<ManuscriptLine>,
    speakerValue: string,
    character?: SpeakerCharacter
  ) => void;
  onToggleExclude: (block: SpeakerBlock<ManuscriptLine>) => void;
  onPlay: (block: SpeakerBlock<ManuscriptLine>) => void;
  onCastVoice: (block: SpeakerBlock<ManuscriptLine>) => void;
  onBlockTextSave?: (
    block: SpeakerBlock<ManuscriptLine>,
    text: string
  ) => Promise<void>;
}) {
  const closingEditRef = useRef(false);
  const [editingText, setEditingText] = useState(false);
  const [draftText, setDraftText] = useState(block.combined_text);
  const [savingText, setSavingText] = useState(false);
  const lead = block.lines[0]!;
  const speakerValue = resolveSpeakerIdFromLine(
    lead.speaker_label,
    lead.speaker_character_id,
    characters as SpeakerCharacter[]
  );
  const excluded = block.lines.every((l) => l.excluded_from_export);
  const flagged = block.lines.some((l) => lineNeedsHumanReview(l));
  const lineRange = `#${block.first_line_order.toLocaleString()}–${block.last_line_order.toLocaleString()}`;
  const canEditText = !!onBlockTextSave;
  const multiLine = block.lines.length > 1;

  useEffect(() => {
    if (!editingText) {
      setDraftText(block.combined_text);
    }
  }, [block.combined_text, editingText]);

  function startTextEditing() {
    if (!canEditText || isSaving || savingText) return;
    closingEditRef.current = false;
    setDraftText(block.combined_text);
    setEditingText(true);
    onHighlight(block);
  }

  function cancelTextEditing() {
    closingEditRef.current = true;
    setEditingText(false);
    setDraftText(block.combined_text);
  }

  async function commitTextEditing() {
    if (!onBlockTextSave || savingText) return;
    const trimmed = draftText.trim();
    if (trimmed === block.combined_text.trim()) {
      cancelTextEditing();
      return;
    }
    if (!trimmed) {
      cancelTextEditing();
      return;
    }
    setSavingText(true);
    try {
      await onBlockTextSave(block, trimmed);
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
      className={`rounded-lg transition-colors ${
        isHighlighted ? "ring-2 ring-teal/40" : ""
      } ${editingText ? "ring-1 ring-burgundy/30" : ""}`}
    >
      <CompactSpeakerBlock
        speakerLabel={block.speaker_label}
        lineRange={lineRange}
        excluded={excluded}
        flagged={flagged}
        voiceName={lead.voice_name}
        onBodyClick={
          editingText || !canEditText ? () => onHighlight(block) : undefined
        }
        headerActions={
          <div
            className="flex flex-wrap items-center gap-2"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => {}}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(block, e.shiftKey);
              }}
              className="h-3.5 w-3.5 rounded"
              aria-label={`Select lines ${lineRange}`}
            />
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
                onSpeakerChange(block, value, character)
              }
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCastVoice(block);
              }}
              className="text-[11px] text-teal hover:underline"
            >
              {lead.voice_name ? (
                <span className="inline-flex items-center gap-1">
                  <Volume2 className="h-3 w-3" />
                  Voice
                </span>
              ) : (
                "Cast voice"
              )}
            </button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={!lead.voice_id || isPlayLoading}
              onClick={(e) => {
                e.stopPropagation();
                onPlay(block);
              }}
            >
              {isPlayLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className={`h-3.5 w-3.5 ${isPlaying ? "text-teal" : ""}`} />
              )}
            </Button>
            <label
              className="flex items-center gap-1 text-[10px] text-slate cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={excluded}
                disabled={isSaving || savingText}
                onChange={() => onToggleExclude(block)}
                className="h-3.5 w-3.5 rounded"
              />
              Skip export
            </label>
            {(isSaving || savingText) && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            )}
          </div>
        }
      >
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
                } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
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
                <>
                  ⌘/Ctrl+Enter to save · Esc to cancel
                  {multiLine && (
                    <span className="text-burgundy/80">
                      {" "}
                      · merges {block.lines.length} lines
                    </span>
                  )}
                </>
              )}
            </p>
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            title={canEditText ? "Click to edit text" : undefined}
            onClick={(e) => {
              e.stopPropagation();
              if (canEditText) startTextEditing();
              else onHighlight(block);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canEditText) {
                e.preventDefault();
                startTextEditing();
              }
            }}
            className={canEditText ? "cursor-text" : "cursor-pointer"}
          >
            {block.combined_text}
          </div>
        )}
      </CompactSpeakerBlock>
    </div>
  );
}
