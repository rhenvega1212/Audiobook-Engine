"use client";

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
import type { SpeakerBlock } from "@/lib/manuscript/group-lines";

export function ManuscriptCompactBlockRow({
  bookId,
  block,
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
  onPlay,
  onCastVoice,
}: {
  bookId: string;
  block: SpeakerBlock<ManuscriptLine>;
  characters: Pick<Character, "id" | "canonical_name" | "aliases">[];
  onCharacterCreated?: (character: SpeakerCharacter) => void;
  isSelected: boolean;
  isHighlighted: boolean;
  isSaving: boolean;
  isPlaying: boolean;
  isPlayLoading: boolean;
  onSelect: (block: SpeakerBlock<ManuscriptLine>, shiftKey: boolean) => void;
  onSpeakerChange: (
    block: SpeakerBlock<ManuscriptLine>,
    speakerValue: string,
    character?: SpeakerCharacter
  ) => void;
  onToggleExclude: (block: SpeakerBlock<ManuscriptLine>) => void;
  onPlay: (block: SpeakerBlock<ManuscriptLine>) => void;
  onCastVoice: (block: SpeakerBlock<ManuscriptLine>) => void;
}) {
  const lead = block.lines[0]!;
  const speakerValue = resolveSpeakerIdFromLine(
    lead.speaker_label,
    lead.speaker_character_id,
    characters as SpeakerCharacter[]
  );
  const excluded = block.lines.every((l) => l.excluded_from_export);
  const flagged = block.lines.some((l) => l.flag_reason);
  const lineRange = `#${block.first_line_order.toLocaleString()}–${block.last_line_order.toLocaleString()}`;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => onSelect(block, e.shiftKey)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(block, e.shiftKey);
        }
      }}
      className={`rounded-lg transition-colors cursor-pointer ${
        isHighlighted ? "ring-2 ring-teal/40" : ""
      }`}
    >
      <CompactSpeakerBlock
        speakerLabel={block.speaker_label}
        lineRange={lineRange}
        excluded={excluded}
        flagged={flagged}
        voiceName={lead.voice_name}
        headerActions={
          <>
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
              disabled={isSaving}
              value={speakerValue}
              characters={characters as SpeakerCharacter[]}
              onCharacterCreated={onCharacterCreated}
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
                disabled={isSaving}
                onChange={() => onToggleExclude(block)}
                className="h-3.5 w-3.5 rounded"
              />
              Skip export
            </label>
            {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          </>
        }
      >
        {block.combined_text}
      </CompactSpeakerBlock>
    </div>
  );
}
