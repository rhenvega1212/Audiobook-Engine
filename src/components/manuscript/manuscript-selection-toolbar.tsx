"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  SpeakerSelect,
  type SpeakerCharacter,
} from "@/components/books/speaker-select";
import type { Character } from "@/lib/types/database";
import {
  formatHotkey,
  loadHotkeyConfig,
  type ManuscriptCommand,
} from "@/lib/manuscript/hotkeys";

export function ManuscriptSelectionToolbar({
  bookId,
  selectedCount,
  bulkSpeaker,
  onBulkSpeakerChange,
  onCharacterCreated,
  characters,
  canMerge,
  canChapterStart,
  busy,
  onApplySpeaker,
  onToggleExport,
  onMerge,
  onChapterStart,
  onDelete,
  onClear,
  onShowHelp,
}: {
  bookId: string;
  selectedCount: number;
  bulkSpeaker: string;
  onBulkSpeakerChange: (value: string, character?: SpeakerCharacter) => void;
  onCharacterCreated?: (character: SpeakerCharacter) => void;
  characters: Pick<Character, "id" | "canonical_name">[];
  canMerge: boolean;
  canChapterStart: boolean;
  busy?: boolean;
  onApplySpeaker: () => void;
  onToggleExport: () => void;
  onMerge: () => void;
  onChapterStart: () => void;
  onDelete: () => void;
  onClear: () => void;
  onShowHelp: () => void;
}) {
  const config = loadHotkeyConfig();

  return (
    <div
      className="sticky top-0 z-40 shrink-0 rounded-lg border border-burgundy/30 bg-cream px-3 py-2 shadow-sm"
      role="toolbar"
      aria-label="Selection actions"
    >
      <div className="flex flex-wrap items-end gap-2">
        <p className="text-body-sm font-medium text-ink w-full sm:w-auto sm:mr-2">
          {selectedCount.toLocaleString()} selected
        </p>

        <div>
          <Label className="text-[10px] text-slate">
            Speaker ({formatHotkey(config.assignSpeaker)})
          </Label>
          <div data-hotkey-speaker>
          <SpeakerSelect
            className="mt-0.5 w-[11rem]"
            bookId={bookId}
            includeUnknown
            size="compact"
            value={bulkSpeaker}
            characters={characters as SpeakerCharacter[]}
            onCharacterCreated={onCharacterCreated}
            onValueChange={(id, character) => onBulkSpeakerChange(id, character)}
            placeholder="Choose…"
          />
          </div>
        </div>

        <Button
          type="button"
          size="sm"
          className="h-8"
          disabled={!bulkSpeaker || busy}
          onClick={onApplySpeaker}
        >
          Apply
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-8"
          disabled={busy}
          onClick={onToggleExport}
          title={formatHotkey(config.toggleExport)}
        >
          Skip / include ({formatHotkey(config.toggleExport)})
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-8"
          disabled={!canMerge || busy}
          onClick={onMerge}
          title={formatHotkey(config.merge)}
        >
          Merge ({formatHotkey(config.merge)})
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-8"
          disabled={!canChapterStart || busy}
          onClick={onChapterStart}
          title={formatHotkey(config.chapterStart)}
        >
          Chapter ({formatHotkey(config.chapterStart)})
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 text-dark-red border-dark-red/40 hover:bg-dark-red/10"
          disabled={busy}
          onClick={onDelete}
          title={formatHotkey(config.delete)}
        >
          Delete ({formatHotkey(config.delete)})
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8"
          onClick={onClear}
          title={formatHotkey(config.clearSelection)}
        >
          Clear
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 ml-auto"
          onClick={onShowHelp}
          title={formatHotkey(config.showHelp)}
        >
          ? Shortcuts
        </Button>
      </div>
    </div>
  );
}

export function hotkeyHint(command: ManuscriptCommand): string {
  const config = loadHotkeyConfig();
  return formatHotkey(config[command]);
}
