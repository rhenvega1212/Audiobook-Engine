"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  SpeakerSelect,
  type SpeakerCharacter,
} from "@/components/books/speaker-select";
import type { Character } from "@/lib/types/database";
import type { TextSelectionPayload } from "@/lib/manuscript/text-selection";
import { isSplitInsideQuote } from "@/lib/engine/quote-spans";
import { formatHotkey, loadHotkeyConfig } from "@/lib/manuscript/hotkeys";

export function LineSelectionToolbar({
  bookId,
  selection,
  lineText,
  characters,
  speakerValue,
  onSpeakerChange,
  mergeTrailingIntoNext,
  onMergeTrailingIntoNextChange,
  canMergeTrailingIntoNext,
  trailingSpeakerValue,
  onTrailingSpeakerChange,
  onCharacterCreated,
  onSplit,
  onDismiss,
  busy,
}: {
  bookId: string;
  selection: TextSelectionPayload;
  lineText: string;
  characters: Pick<Character, "id" | "canonical_name">[];
  speakerValue: string;
  onSpeakerChange: (value: string, character?: SpeakerCharacter) => void;
  mergeTrailingIntoNext: boolean;
  onMergeTrailingIntoNextChange: (checked: boolean) => void;
  canMergeTrailingIntoNext: boolean;
  trailingSpeakerValue: string;
  onTrailingSpeakerChange: (value: string, character?: SpeakerCharacter) => void;
  onCharacterCreated?: (character: SpeakerCharacter) => void;
  onSplit: () => void;
  onDismiss: () => void;
  busy?: boolean;
}) {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const splitInvalid = isSplitInsideQuote(
    lineText,
    selection.start,
    selection.end
  );
  const splitKey = formatHotkey(loadHotkeyConfig().splitSelection);

  useEffect(() => {
    const pad = 8;
    const top = selection.rect.top + window.scrollY - 52;
    const left = Math.min(
      selection.rect.left + window.scrollX,
      window.innerWidth - 320
    );
    setPosition({ top: Math.max(pad, top), left: Math.max(pad, left) });
  }, [selection]);

  return (
    <div
      className="fixed z-50 flex flex-wrap items-center gap-2 rounded-lg border border-burgundy/30 bg-cream px-3 py-2 shadow-lg max-w-[min(100vw-1rem,28rem)]"
      style={{ top: position.top, left: position.left }}
      role="toolbar"
      aria-label="Split selection"
    >
      <p className="text-[10px] text-slate w-full truncate">
        “{selection.selectedText.slice(0, 40)}
        {selection.selectedText.length > 40 ? "…" : ""}”
      </p>
      {splitInvalid && (
        <p className="text-[10px] text-dark-red w-full">
          Can&apos;t split inside quoted dialogue — select the narration before the
          quote, the full quoted line (with quote marks), or use &quot;Move dialogue
          to next line&quot; below.
        </p>
      )}
      <SpeakerSelect
        bookId={bookId}
        size="compact"
        includeUnknown
        className="w-[11rem]"
        value={speakerValue}
        characters={characters as SpeakerCharacter[]}
        onCharacterCreated={onCharacterCreated}
        onValueChange={(value, character) => onSpeakerChange(value, character)}
      />
      {canMergeTrailingIntoNext && (
        <div className="flex flex-col gap-2 w-full border-t border-burgundy/15 pt-2">
          <div className="flex items-center gap-2">
            <input
              id="merge-trailing"
              type="checkbox"
              checked={mergeTrailingIntoNext}
              onChange={(e) => onMergeTrailingIntoNextChange(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-burgundy/40 accent-burgundy"
            />
            <Label htmlFor="merge-trailing" className="text-[10px] font-normal">
              Merge dialogue into line below (instead of new line)
            </Label>
          </div>
          {mergeTrailingIntoNext && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] text-slate">Dialogue voice:</span>
              <SpeakerSelect
                bookId={bookId}
                size="compact"
                includeUnknown
                className="w-[11rem]"
                value={trailingSpeakerValue}
                characters={characters as SpeakerCharacter[]}
                onCharacterCreated={onCharacterCreated}
                onValueChange={(value, character) =>
                  onTrailingSpeakerChange(value, character)
                }
              />
            </div>
          )}
        </div>
      )}
      <Button
        type="button"
        size="sm"
        className="h-8"
        disabled={busy || splitInvalid}
        onClick={onSplit}
        title={splitKey}
      >
        {busy ? "Splitting…" : `Split (${splitKey})`}
      </Button>
      <Button type="button" size="sm" variant="ghost" className="h-8" onClick={onDismiss}>
        Cancel
      </Button>
    </div>
  );
}
