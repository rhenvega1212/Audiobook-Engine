"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
          Can&apos;t split inside quoted dialogue — select the full line or text
          outside quotes.
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
