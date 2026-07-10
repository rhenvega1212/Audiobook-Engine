"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { ChevronDown, Loader2, SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VoicePickerDialog } from "@/components/voice-picker-dialog";
import { VirtualManuscriptList } from "@/components/manuscript/virtual-manuscript-list";
import { ManuscriptLineRow } from "@/components/manuscript/manuscript-line-row";
import type { ManuscriptLine } from "@/lib/manuscript/types";
import { ManuscriptCompactBlockRow } from "@/components/manuscript/manuscript-compact-block-row";
import { groupConsecutiveSpeakerBlocks,
  type SpeakerBlock,
} from "@/lib/manuscript/group-lines";
import {
  countUnresolvedFlags,
  lineNeedsHumanReview,
} from "@/lib/books/flagged-lines";
import { useLineAudioPlayer } from "@/components/audio/line-player";
import { findCharacterBySpeaker } from "@/lib/characters/resolve-character";
import { buildSpeakerStudioRoster } from "@/lib/books/speaker-studio-roster";
import { voicePlaybackFromCharacter } from "@/lib/elevenlabs/voice-cast";
import { LineSelectionToolbar } from "@/components/manuscript/line-selection-toolbar";
import { UndoEditButton } from "@/components/manuscript/undo-edit-button";
import { useManuscriptUndo } from "@/lib/manuscript/use-manuscript-undo";
import { ManuscriptSelectionToolbar } from "@/components/manuscript/manuscript-selection-toolbar";
import { ManuscriptHotkeysDialog } from "@/components/manuscript/manuscript-hotkeys-dialog";
import type { TextSelectionPayload } from "@/lib/manuscript/text-selection";
import { isSplitInsideQuote, trailingTextStartsDialogue } from "@/lib/engine/quote-spans";
import {
  findCommandForEvent,
  isEditableTarget,
  loadHotkeyConfig,
} from "@/lib/manuscript/hotkeys";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { resolveSpeaker } from "@/lib/manuscript/speaker-utils";
import type { Character } from "@/lib/types/database";
import {
  SpeakerSelect,
  resolveSpeakerIdFromLine,
  type SpeakerCharacter,
} from "@/components/books/speaker-select";
import { resolveSpokenLine, type PronunciationEntry } from "@/lib/pronunciation/apply";
import { voiceAssignmentsFromCharacters } from "@/lib/elevenlabs/voice-picker-utils";
import { ManuscriptChapterNav } from "@/components/manuscript/manuscript-chapter-nav";
import {
  buildManuscriptChapters,
  findChapterForLine,
  filterLinesByChapter,
  MANUSCRIPT_FULL_ID,
} from "@/lib/manuscript/chapters";
import {
  chaptersFromRecords,
  type BookChapterRow,
} from "@/lib/books/book-chapters";
import { SaveCheckpointButton } from "@/components/books/save-checkpoint-button";
import {
  AiReviewSetupDialog,
  type AiReviewLaunchOptions,
} from "@/components/books/ai-review-setup-dialog";
import { AiReviewPreviewDialog } from "@/components/books/ai-review-preview-dialog";
import { runBatchAiReviewPreview } from "@/lib/books/run-ai-review-client";
import type { AiReviewProposal } from "@/lib/books/ai-review-proposals";
import type { AiReviewAppliedChange } from "@/lib/books/ai-review-proposals";
import type { AiReviewEligibilityStats } from "@/lib/books/ai-review-eligibility";
import type { AiReviewScope } from "@/lib/books/ai-review-scope";
import {
  reorderManuscriptLines,
  targetLineOrderForDrop,
} from "@/lib/manuscript/reorder-lines";
import {
  fetchWithTimeout,
  operationErrorMessage,
} from "@/lib/api/fetch-with-timeout";
import type { SplitLineRow } from "@/lib/books/line-operations";

function splitRowToManuscriptLine(
  row: SplitLineRow,
  roster: Character[]
): ManuscriptLine {
  const char =
    roster.find((c) => c.id === row.speaker_character_id) ??
    findCharacterBySpeaker(row.speaker_label, roster);
  return {
    id: row.id,
    line_order: row.line_order,
    paragraph_num: row.paragraph_num,
    speaker_label: row.speaker_label,
    speaker_character_id: row.speaker_character_id,
    line_text: row.line_text,
    flag_reason: row.flag_reason,
    human_reviewed: row.human_reviewed ?? true,
    excluded_from_export: row.excluded_from_export ?? false,
    voice_id: char?.elevenlabs_voice_id ?? null,
    voice_name: char?.elevenlabs_voice_name ?? null,
    voice_playback: voicePlaybackFromCharacter(char),
  };
}

function mergeSplitIntoLines(
  prev: ManuscriptLine[],
  returned: SplitLineRow[],
  roster: Character[],
  splitAtOrder: number,
  insertedCount: number
): ManuscriptLine[] {
  const mappedById = new Map(
    returned.map((row) => [row.id, splitRowToManuscriptLine(row, roster)])
  );

  const merged = prev.map((line) => {
    if (mappedById.has(line.id)) return mappedById.get(line.id)!;
    if (insertedCount > 0 && line.line_order > splitAtOrder) {
      return { ...line, line_order: line.line_order + insertedCount };
    }
    return line;
  });

  const existing = new Set(merged.map((l) => l.id));
  for (const line of mappedById.values()) {
    if (!existing.has(line.id)) merged.push(line);
  }

  return merged.sort((a, b) => a.line_order - b.line_order);
}

function areSelectedLinesAdjacent(
  allLines: ManuscriptLine[],
  selected: Set<string>
): boolean {
  const orders = allLines
    .filter((l) => selected.has(l.id))
    .map((l) => l.line_order)
    .sort((a, b) => a - b);
  if (orders.length < 2) return false;
  for (let i = 1; i < orders.length; i++) {
    if (orders[i] !== orders[i - 1]! + 1) return false;
  }
  return true;
}

export function ManuscriptStudioClient({
  bookId,
  bookTitle,
  initialLines,
  characters,
  dictionary,
  initialLineId,
  initialSpeaker,
  initialFlaggedOnly = false,
  initialBookChapters = [],
  speechTagsByLineId = {},
  initialMissingSpeechTagCount = 0,
  initialUndoCount = 0,
}: {
  bookId: string;
  bookTitle: string;
  initialLines: ManuscriptLine[];
  characters: Character[];
  dictionary: PronunciationEntry[];
  initialLineId?: string;
  initialSpeaker?: string;
  initialFlaggedOnly?: boolean;
  initialBookChapters?: BookChapterRow[];
  speechTagsByLineId?: Record<string, string>;
  initialMissingSpeechTagCount?: number;
  initialUndoCount?: number;
}) {
  const router = useRouter();
  const { undoCount, undoBusy, applyUndo, refreshUndoCount } = useManuscriptUndo(
    bookId,
    initialUndoCount
  );
  const [, startTransition] = useTransition();
  const { playingId, loadingId, playLine } = useLineAudioPlayer();
  const [lines, setLines] = useState(initialLines);
  const [rosterCharacters, setRosterCharacters] = useState(characters);
  const [controlsOpen, setControlsOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem("ms-controls-open") === "1") {
        setControlsOpen(true);
      }
    } catch {
      // ignore
    }
  }, []);

  function toggleControls() {
    setControlsOpen((open) => {
      const next = !open;
      try {
        localStorage.setItem("ms-controls-open", next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  useEffect(() => {
    setLines(initialLines);
  }, [initialLines]);

  useEffect(() => {
    setRosterCharacters(characters);
  }, [characters]);

  const handleCharacterCreated = useCallback(
    (c: SpeakerCharacter) => {
      setRosterCharacters((prev) => {
        if (prev.some((x) => x.id === c.id)) return prev;
        const seriesId = prev[0]?.series_id ?? characters[0]?.series_id ?? "";
        return [
          ...prev,
          {
            id: c.id,
            series_id: seriesId,
            canonical_name: c.canonical_name,
            aliases: [],
            gender: "unknown",
            role: "guest",
            description: null,
            elevenlabs_voice_id: c.elevenlabs_voice_id ?? null,
            elevenlabs_voice_name: c.elevenlabs_voice_name ?? null,
            voice_style: null,
            voice_accent: null,
            voice_locale: null,
            voice_language: null,
            voice_settings: null,
            voice_notes: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ];
      });
      router.refresh();
    },
    [characters, router]
  );

  const handleCharacterDeleted = useCallback(
    (characterId: string) => {
      setRosterCharacters((prev) => prev.filter((c) => c.id !== characterId));
      // Any lines that pointed at the deleted character are reset to UNKNOWN
      // server-side; mirror that locally so the list updates immediately.
      setLines((prev) =>
        prev.map((l) =>
          l.speaker_character_id === characterId
            ? {
                ...l,
                speaker_character_id: null,
                speaker_label: "UNKNOWN",
                voice_id: null,
                voice_name: null,
                voice_playback: null,
              }
            : l
        )
      );
      router.refresh();
    },
    [router]
  );

  const handleCharacterMerged = useCallback(
    (sourceId: string, targetId: string) => {
      const target = rosterCharacters.find((c) => c.id === targetId);
      // Re-point local lines from the merged-away character onto the target.
      setLines((prev) =>
        prev.map((l) =>
          l.speaker_character_id === sourceId
            ? {
                ...l,
                speaker_character_id: targetId,
                speaker_label: target?.canonical_name ?? l.speaker_label,
                voice_id: target?.elevenlabs_voice_id ?? null,
                voice_name: target?.elevenlabs_voice_name ?? null,
                voice_playback: voicePlaybackFromCharacter(target),
              }
            : l
        )
      );
      setRosterCharacters((prev) => prev.filter((c) => c.id !== sourceId));
      router.refresh();
    },
    [rosterCharacters, router]
  );

  const [search, setSearch] = useState("");
  const [speakerFilter, setSpeakerFilter] = useState(
    initialSpeaker && initialLines.some((l) => l.speaker_label === initialSpeaker)
      ? initialSpeaker
      : "all"
  );
  const [flaggedOnly, setFlaggedOnly] = useState(initialFlaggedOnly ?? false);
  const [compactView, setCompactView] = useState(false);
  const [showExcluded, setShowExcluded] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [highlightLineId, setHighlightLineId] = useState<string | null>(
    initialLineId ?? null
  );
  const [scrollToIndex, setScrollToIndex] = useState<number | null>(null);
  const [scrollKey, setScrollKey] = useState(0);
  const [chapterFilter, setChapterFilter] = useState(MANUSCRIPT_FULL_ID);
  const [jumpLine, setJumpLine] = useState("");
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkSpeaker, setBulkSpeaker] = useState<string>("");
  const [pickerChar, setPickerChar] = useState<Character | null>(null);
  const [pickerSamples, setPickerSamples] = useState<string[]>([]);
  const [textSelection, setTextSelection] = useState<TextSelectionPayload | null>(
    null
  );
  const [splitSpeaker, setSplitSpeaker] = useState("");
  const [splitSpeakerHint, setSplitSpeakerHint] = useState<
    SpeakerCharacter | undefined
  >();
  const [bulkSpeakerHint, setBulkSpeakerHint] = useState<
    SpeakerCharacter | undefined
  >();
  const [splitBusy, setSplitBusy] = useState(false);
  const [reorderBusy, setReorderBusy] = useState(false);
  const [draggingLineId, setDraggingLineId] = useState<string | null>(null);
  const [dragOverLineId, setDragOverLineId] = useState<string | null>(null);
  const [mergeTrailingIntoNext, setMergeTrailingIntoNext] = useState(false);
  const [trailingSpeaker, setTrailingSpeaker] = useState("");
  const [trailingSpeakerHint, setTrailingSpeakerHint] = useState<
    SpeakerCharacter | undefined
  >();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState(0);
  const [deleteStage, setDeleteStage] = useState("");
  const [bookChapters, setBookChapters] =
    useState<BookChapterRow[]>(initialBookChapters);
  const [chapterDialogOpen, setChapterDialogOpen] = useState(false);
  const [chapterTitle, setChapterTitle] = useState("");
  const [chapterSaving, setChapterSaving] = useState(false);
  const [hotkeysOpen, setHotkeysOpen] = useState(false);
  const [repairTagsBusy, setRepairTagsBusy] = useState(false);
  const [missingSpeechTagCount, setMissingSpeechTagCount] = useState(
    initialMissingSpeechTagCount
  );
  const [aiSetupOpen, setAiSetupOpen] = useState(false);
  const [aiPreviewOpen, setAiPreviewOpen] = useState(false);
  const [aiPreviewLoading, setAiPreviewLoading] = useState(false);
  const [aiReviewLoading, setAiReviewLoading] = useState(false);
  const [aiReviewProgress, setAiReviewProgress] = useState(0);
  const [aiReviewMessage, setAiReviewMessage] = useState("");
  const [aiProposals, setAiProposals] = useState<AiReviewProposal[]>([]);
  const [aiEligibility, setAiEligibility] =
    useState<AiReviewEligibilityStats | null>(null);
  const [aiRespectHuman, setAiRespectHuman] = useState(true);
  const jumpInputRef = useRef<HTMLInputElement>(null);
  const lastSelectedIndexRef = useRef<number | null>(null);

  useEffect(() => {
    setBookChapters(initialBookChapters);
  }, [initialBookChapters]);

  useEffect(() => {
    setMissingSpeechTagCount(initialMissingSpeechTagCount);
  }, [initialMissingSpeechTagCount]);

  const speakers = useMemo(
    () => [...new Set(lines.map((l) => l.speaker_label))].sort(),
    [lines]
  );

  const chapters = useMemo(() => {
    if (bookChapters.length > 0) {
      return chaptersFromRecords(bookChapters, lines);
    }
    return buildManuscriptChapters(lines);
  }, [bookChapters, lines]);

  const chapterStartOrders = useMemo(
    () => new Set(bookChapters.map((c) => c.start_line_order)),
    [bookChapters]
  );

  const activeChapter = useMemo(() => {
    if (chapterFilter === MANUSCRIPT_FULL_ID) return null;
    return chapters.find((c) => c.id === chapterFilter) ?? null;
  }, [chapters, chapterFilter]);

  const aiScope = useMemo((): AiReviewScope => {
    if (chapterFilter !== MANUSCRIPT_FULL_ID) {
      return { type: "chapter", chapterId: chapterFilter };
    }
    return { type: "flagged" };
  }, [chapterFilter]);

  const aiScopeLabelText = useMemo(() => {
    if (activeChapter) return `Chapter: ${activeChapter.title}`;
    return "Whole book";
  }, [activeChapter]);

  const chapterScopedLines = useMemo(
    () => filterLinesByChapter(lines, activeChapter),
    [lines, activeChapter]
  );

  const applyManuscriptFilters = useCallback(
    (source: ManuscriptLine[]) => {
      let result = source;
      if (!showExcluded) {
        result = result.filter((l) => !l.excluded_from_export);
      }
      if (speakerFilter !== "all") {
        result = result.filter((l) => l.speaker_label === speakerFilter);
      }
      if (flaggedOnly) {
        result = result.filter((l) => lineNeedsHumanReview(l));
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        result = result.filter(
          (l) =>
            l.line_text.toLowerCase().includes(q) ||
            l.speaker_label.toLowerCase().includes(q)
        );
      }
      return result;
    },
    [speakerFilter, flaggedOnly, showExcluded, search]
  );

  const filtered = useMemo(
    () => applyManuscriptFilters(chapterScopedLines),
    [chapterScopedLines, applyManuscriptFilters]
  );

  const blocks = useMemo(
    () => groupConsecutiveSpeakerBlocks(filtered),
    [filtered]
  );

  const stats = useMemo(() => {
    const excluded = lines.filter((l) => l.excluded_from_export).length;
    const flagged = countUnresolvedFlags(lines);
    return { total: lines.length, excluded, flagged };
  }, [lines]);

  const speakerRoster = useMemo(
    () => buildSpeakerStudioRoster(lines, rosterCharacters),
    [lines, rosterCharacters]
  );

  const rosterPick = useMemo(
    () =>
      speakerRoster.map((c) => ({
        ...c,
        aliases: c.aliases ?? [],
      })),
    [speakerRoster]
  );

  useEffect(() => {
    if (!initialLineId || chapters.length === 0) return;
    const line = lines.find((l) => l.id === initialLineId);
    if (!line) return;
    const ch = findChapterForLine(chapters, line.line_order);
    if (ch) setChapterFilter(ch.id);
  }, [initialLineId, lines, chapters]);

  useEffect(() => {
    if (!initialLineId) return;
    if (compactView) {
      const idx = blocks.findIndex((b) => b.line_ids.includes(initialLineId));
      if (idx >= 0) {
        setScrollToIndex(idx);
        setHighlightLineId(initialLineId);
      }
    } else {
      const idx = filtered.findIndex((l) => l.id === initialLineId);
      if (idx >= 0) {
        setScrollToIndex(idx);
        setHighlightLineId(initialLineId);
      }
    }
  }, [initialLineId, filtered, blocks, compactView]);

  const seriesVoiceAssignments = useMemo(
    () => voiceAssignmentsFromCharacters(rosterCharacters),
    [rosterCharacters]
  );

  useEffect(() => {
    if (!textSelection) return;
    const line = lines.find((l) => l.id === textSelection.lineId);
    if (line) {
      setSplitSpeaker(
        resolveSpeakerIdFromLine(
          line.speaker_label,
          line.speaker_character_id,
          rosterPick as SpeakerCharacter[]
        )
      );
      const idx = lines.findIndex((l) => l.id === textSelection.lineId);
      const nextLine = idx >= 0 && idx + 1 < lines.length ? lines[idx + 1]! : null;
      const canMerge =
        !!nextLine &&
        trailingTextStartsDialogue(line.line_text, textSelection.end);
      setMergeTrailingIntoNext(false);
      if (canMerge && nextLine) {
        setTrailingSpeaker(
          resolveSpeakerIdFromLine(
            nextLine.speaker_label,
            nextLine.speaker_character_id,
            rosterPick as SpeakerCharacter[]
          )
        );
      }
    }
  }, [textSelection, lines, rosterPick]);

  const markSaving = useCallback((ids: string[], saving: boolean) => {
    setSavingIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (saving) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  async function patchLine(
    lineId: string,
    body: Record<string, unknown>
  ): Promise<boolean> {
    const res = await fetchWithTimeout(`/api/books/${bookId}/lines/${lineId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error ?? "Save failed");
    }
    void refreshUndoCount();
    return true;
  }

  async function bulkPatch(
    lineIds: string[],
    body: Record<string, unknown>
  ): Promise<boolean> {
    const res = await fetchWithTimeout(`/api/books/${bookId}/lines/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ line_ids: lineIds, ...body }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error ?? "Bulk update failed");
    }
    void refreshUndoCount();
    return true;
  }

  function voiceForLine(line: ManuscriptLine) {
    const char =
      rosterCharacters.find((c) => c.id === line.speaker_character_id) ??
      findCharacterBySpeaker(line.speaker_label, rosterCharacters);
    return {
      voice_id: char?.elevenlabs_voice_id ?? null,
      voice_name: char?.elevenlabs_voice_name ?? null,
      voice_playback: voicePlaybackFromCharacter(char),
      character: char,
    };
  }

  function applyLinePatch(
    lineId: string,
    patch: Partial<ManuscriptLine>
  ) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== lineId) return l;
        const next = { ...l, ...patch };
        const { voice_id, voice_name, voice_playback } = voiceForLine(next);
        return { ...next, voice_id, voice_name, voice_playback };
      })
    );
  }

  function handleHighlightLine(lineId: string) {
    const index = filtered.findIndex((l) => l.id === lineId);
    if (index < 0) return;
    setHighlightLineId(lineId);
    lastSelectedIndexRef.current = index;
  }

  function handleToggleSelect(lineId: string, shiftKey: boolean) {
    const index = filtered.findIndex((l) => l.id === lineId);
    if (index < 0) return;

    setHighlightLineId(lineId);

    if (shiftKey && lastSelectedIndexRef.current != null) {
      const from = Math.min(lastSelectedIndexRef.current, index);
      const to = Math.max(lastSelectedIndexRef.current, index);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (let i = from; i <= to; i++) {
          next.add(filtered[i]!.id);
        }
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(lineId)) next.delete(lineId);
        else next.add(lineId);
        return next;
      });
    }
    lastSelectedIndexRef.current = index;
  }

  function handleHighlightBlock(block: SpeakerBlock<ManuscriptLine>) {
    const index = blocks.findIndex((b) => b.key === block.key);
    if (index < 0) return;
    setHighlightLineId(block.lines[0]!.id);
    lastSelectedIndexRef.current = index;
  }

  function handleToggleSelectBlock(
    block: SpeakerBlock<ManuscriptLine>,
    shiftKey: boolean
  ) {
    const index = blocks.findIndex((b) => b.key === block.key);
    if (index < 0) return;
    setHighlightLineId(block.lines[0]!.id);

    if (shiftKey && lastSelectedIndexRef.current != null) {
      const from = Math.min(lastSelectedIndexRef.current, index);
      const to = Math.max(lastSelectedIndexRef.current, index);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (let i = from; i <= to; i++) {
          for (const id of blocks[i]!.line_ids) next.add(id);
        }
        return next;
      });
    } else {
      const allSelected = block.line_ids.every((id) => selectedIds.has(id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of block.line_ids) {
          if (allSelected) next.delete(id);
          else next.add(id);
        }
        return next;
      });
    }
    lastSelectedIndexRef.current = index;
  }

  async function handleBlockSpeakerChange(
    block: SpeakerBlock<ManuscriptLine>,
    value: string,
    hint?: SpeakerCharacter
  ) {
    const { speaker_label, speaker_character_id } = resolveSpeaker(
      value,
      rosterCharacters,
      hint
    );
    markSaving(block.line_ids, true);
    try {
      await bulkPatch(block.line_ids, {
        speaker_label,
        speaker_character_id,
        human_reviewed: true,
      });
      for (const id of block.line_ids) {
        applyLinePatch(id, { speaker_label, speaker_character_id });
      }
      toast.success(`Speaker updated on ${block.line_ids.length} lines`);
    } catch (e) {
      toast.error(operationErrorMessage(e, "Save"));
    } finally {
      markSaving(block.line_ids, false);
    }
  }

  async function handleBlockToggleExclude(block: SpeakerBlock<ManuscriptLine>) {
    const excluded = !block.lines.every((l) => l.excluded_from_export);
    markSaving(block.line_ids, true);
    try {
      await bulkPatch(block.line_ids, { excluded_from_export: excluded });
      for (const id of block.line_ids) {
        applyLinePatch(id, { excluded_from_export: excluded });
      }
      toast.success(
        excluded
          ? `Excluded ${block.line_ids.length} lines from export`
          : `Included ${block.line_ids.length} lines in export`
      );
    } catch (e) {
      toast.error(operationErrorMessage(e, "Save"));
    } finally {
      markSaving(block.line_ids, false);
    }
  }

  function handleBlockPlay(block: SpeakerBlock<ManuscriptLine>) {
    const lead = block.lines.find((l) => l.voice_id) ?? block.lines[0]!;
    const spoken = block.lines
      .map((l) => resolveSpokenLine(l.line_text, null, dictionary))
      .join("\n");
    void playLine(lead.id, lead.voice_id ?? "", spoken, lead.voice_playback ?? undefined);
  }

  function handleBlockCastVoice(block: SpeakerBlock<ManuscriptLine>) {
    handleCastVoice(block.lines[0]!);
  }

  async function handleSpeakerChange(
    line: ManuscriptLine,
    value: string,
    hint?: SpeakerCharacter
  ) {
    const { speaker_label, speaker_character_id } = resolveSpeaker(
      value,
      rosterCharacters,
      hint
    );
    markSaving([line.id], true);
    try {
      await patchLine(line.id, {
        speaker_label,
        speaker_character_id,
        human_reviewed: true,
      });
      applyLinePatch(line.id, { speaker_label, speaker_character_id });
      toast.success("Speaker updated");
    } catch (e) {
      toast.error(operationErrorMessage(e, "Save"));
    } finally {
      markSaving([line.id], false);
    }
  }

  async function handleToggleExclude(line: ManuscriptLine) {
    const excluded = !line.excluded_from_export;
    markSaving([line.id], true);
    try {
      await patchLine(line.id, { excluded_from_export: excluded });
      applyLinePatch(line.id, { excluded_from_export: excluded });
      toast.success(excluded ? "Line excluded from export" : "Line included in export");
    } catch (e) {
      toast.error(operationErrorMessage(e, "Save"));
    } finally {
      markSaving([line.id], false);
    }
  }

  async function handleClearFlag(line: ManuscriptLine) {
    markSaving([line.id], true);
    try {
      await patchLine(line.id, { flag_reason: null, human_reviewed: true });
      applyLinePatch(line.id, { flag_reason: null });
      toast.success("Flag cleared");
    } catch (e) {
      toast.error(operationErrorMessage(e, "Save"));
    } finally {
      markSaving([line.id], false);
    }
  }

  async function handleLineTextSave(line: ManuscriptLine, lineText: string) {
    markSaving([line.id], true);
    try {
      await patchLine(line.id, { line_text: lineText });
      applyLinePatch(line.id, { line_text: lineText });
    } catch (e) {
      toast.error(operationErrorMessage(e, "Save"));
      throw e;
    } finally {
      markSaving([line.id], false);
    }
  }

  async function handleBlockTextSave(
    block: SpeakerBlock<ManuscriptLine>,
    text: string
  ) {
    const lineIds = block.line_ids;
    markSaving(lineIds, true);
    try {
      if (block.lines.length === 1) {
        await patchLine(block.lines[0]!.id, { line_text: text });
        applyLinePatch(block.lines[0]!.id, { line_text: text });
        return;
      }

      const res = await fetchWithTimeout(
        `/api/books/${bookId}/lines/edit-paragraph`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ line_ids: lineIds, text }),
        }
      );
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
      void refreshUndoCount();
    } catch (e) {
      toast.error(operationErrorMessage(e, "Save"));
      throw e;
    } finally {
      markSaving(lineIds, false);
    }
  }

  function handlePlay(line: ManuscriptLine) {
    const spoken = resolveSpokenLine(line.line_text, null, dictionary);
    void playLine(line.id, line.voice_id ?? "", spoken, line.voice_playback ?? undefined);
  }

  function handleCastVoice(line: ManuscriptLine) {
    const char = voiceForLine(line).character;
    if (!char) {
      toast.error(
        `No character in library for "${line.speaker_label}". Create them in Characters first.`
      );
      return;
    }
    setPickerChar(char);
    setPickerSamples([line.line_text]);
  }

  async function launchAiReview(options: AiReviewLaunchOptions) {
    setAiSetupOpen(false);
    setAiPreviewOpen(true);
    setAiPreviewLoading(true);
    setAiProposals([]);
    setAiReviewLoading(true);
    setAiReviewProgress(3);
    setAiReviewMessage("Reading scenes from Word file…");
    setAiRespectHuman(options.respectHumanReviewed);

    try {
      const result = await runBatchAiReviewPreview(
        bookId,
        ({ message, progress }) => {
          setAiReviewMessage(message);
          setAiReviewProgress(progress);
        },
        {
          scope: options.scope,
          chapters: bookChapters,
          includeAiReviewed: options.includeAiReviewed,
          respectHumanReviewed: options.respectHumanReviewed,
          fullScrub: options.fullScrub,
        }
      );

      setAiProposals(result.proposals);
      setAiEligibility(result.eligibility ?? null);
      setAiPreviewLoading(false);
      if (result.proposals.length === 0) {
        toast.message("No changes suggested for this scope and mode");
      }
    } catch (e) {
      setAiPreviewOpen(false);
      toast.error(e instanceof Error ? e.message : "AI preview failed");
    } finally {
      setAiReviewLoading(false);
      setAiPreviewLoading(false);
    }
  }

  function handleAiApplied({
    applied,
    changes,
  }: {
    applied: number;
    changes: AiReviewAppliedChange[];
  }) {
    if (applied > 0 && changes.length > 0) {
      const byId = new Map(changes.map((c) => [c.line_id, c]));
      setLines((prev) =>
        prev.map((line) => {
          const update = byId.get(line.id);
          if (!update) return line;
          const char =
            rosterCharacters.find((c) => c.id === update.speaker_character_id) ??
            findCharacterBySpeaker(update.speaker_label, rosterCharacters);
          return {
            ...line,
            speaker_label: update.speaker_label,
            speaker_character_id: update.speaker_character_id,
            flag_reason: update.flag_reason,
            voice_id: char?.elevenlabs_voice_id ?? null,
            voice_name: char?.elevenlabs_voice_name ?? null,
            voice_playback: voicePlaybackFromCharacter(char),
          };
        })
      );
    }
    toast.success(
      applied > 0
        ? `Applied ${applied} speaker update${applied === 1 ? "" : "s"}`
        : "No changes applied"
    );
    startTransition(() => router.refresh());
  }

  function openChapterDialog() {
    const line =
      selectedIds.size === 1
        ? lines.find((l) => selectedIds.has(l.id))
        : null;
    if (!line) {
      toast.error("Select exactly one line to mark as a chapter start");
      return;
    }
    setChapterTitle(line.line_text.trim().slice(0, 120));
    setChapterDialogOpen(true);
  }

  async function confirmChapterStart() {
    const lineId =
      selectedIds.size === 1 ? [...selectedIds][0] : null;
    if (!lineId) return;

    setChapterSaving(true);
    try {
      const res = await fetchWithTimeout(`/api/books/${bookId}/chapters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          line_id: lineId,
          title: chapterTitle.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ?? "Could not set chapter"
        );
      }
      setBookChapters((data as { chapters: BookChapterRow[] }).chapters ?? []);
      setChapterDialogOpen(false);
      toast.success("Chapter start saved");
    } catch (e) {
      toast.error(operationErrorMessage(e, "Set chapter"));
    } finally {
      setChapterSaving(false);
    }
  }

  async function rebuildChaptersFromHeadings() {
    setChapterSaving(true);
    try {
      const res = await fetchWithTimeout(`/api/books/${bookId}/chapters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rebuild" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ?? "Could not rebuild chapters"
        );
      }
      setBookChapters((data as { chapters: BookChapterRow[] }).chapters ?? []);
      toast.success(
        `Rebuilt ${((data as { rebuilt?: number }).rebuilt ?? 0).toLocaleString()} chapters from headings`
      );
    } catch (e) {
      toast.error(operationErrorMessage(e, "Rebuild"));
    } finally {
      setChapterSaving(false);
    }
  }

  async function repairSpeechTags() {
    setRepairTagsBusy(true);
    try {
      const res = await fetchWithTimeout(
        `/api/books/${bookId}/repair-speech-tags`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "Repair failed");
      }
      const inserted = (data as { inserted?: number }).inserted ?? 0;
      if (inserted > 0) {
        toast.success(
          `Inserted ${inserted.toLocaleString()} speech tag${inserted === 1 ? "" : "s"} from your Word file`
        );
        setMissingSpeechTagCount(Math.max(0, missingSpeechTagCount - inserted));
        startTransition(() => router.refresh());
      } else {
        toast.message("All speech tags from Word are already in the manuscript");
      }
    } catch (e) {
      toast.error(operationErrorMessage(e, "Repair"));
    } finally {
      setRepairTagsBusy(false);
    }
  }

  function handleChapterChange(chapterId: string) {
    setChapterFilter(chapterId);
    setScrollToIndex(0);
    setScrollKey((k) => k + 1);
    if (chapterId !== MANUSCRIPT_FULL_ID) {
      const ch = chapters.find((c) => c.id === chapterId);
      if (ch) setHighlightLineId(ch.firstLineId);
    }
  }

  function jumpToLineOrder() {
    const n = parseInt(jumpLine, 10);
    if (!Number.isFinite(n)) {
      toast.error("Enter a line number");
      return;
    }
    const ch = findChapterForLine(chapters, n);
    if (ch && ch.id !== chapterFilter) {
      setChapterFilter(ch.id);
      setScrollToIndex(0);
      setScrollKey((k) => k + 1);
    }
    const jumpBase = ch
      ? filterLinesByChapter(lines, ch)
      : chapterFilter === MANUSCRIPT_FULL_ID
        ? lines
        : chapterScopedLines;
    const jumpFiltered = applyManuscriptFilters(jumpBase);
    if (compactView) {
      const jumpBlocks = groupConsecutiveSpeakerBlocks(jumpFiltered);
      const idx = jumpBlocks.findIndex(
        (b) => b.first_line_order <= n && b.last_line_order >= n
      );
      if (idx < 0) {
        toast.error(`Line #${n} not found with current filters`);
        return;
      }
      setScrollToIndex(idx);
      setHighlightLineId(jumpBlocks[idx]!.lines[0]!.id);
    } else {
      const idx = jumpFiltered.findIndex((l) => l.line_order === n);
      if (idx < 0) {
        toast.error(`Line #${n} not found with current filters`);
        return;
      }
      setScrollToIndex(idx);
      setHighlightLineId(jumpFiltered[idx]!.id);
    }
  }

  function selectAllFiltered() {
    setSelectedIds(new Set(filtered.map((l) => l.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
    lastSelectedIndexRef.current = null;
  }

  async function applyBulkSpeaker() {
    if (!bulkSpeaker || selectedIds.size === 0) return;
    const { speaker_label, speaker_character_id } = resolveSpeaker(
      bulkSpeaker,
      rosterCharacters,
      bulkSpeakerHint
    );
    const ids = [...selectedIds];
    setBulkSaving(true);
    markSaving(ids, true);
    try {
      await bulkPatch(ids, {
        speaker_label,
        speaker_character_id,
        human_reviewed: true,
      });
      setLines((prev) =>
        prev.map((l) => {
          if (!selectedIds.has(l.id)) return l;
          const next = { ...l, speaker_label, speaker_character_id };
          const { voice_id, voice_name, voice_playback } = voiceForLine(next);
          return { ...next, voice_id, voice_name, voice_playback };
        })
      );
      toast.success(`Updated speaker on ${ids.length} lines`);
      clearSelection();
    } catch (e) {
      toast.error(operationErrorMessage(e, "Bulk update"));
    } finally {
      setBulkSaving(false);
      markSaving(ids, false);
    }
  }

  async function applyTextSplit() {
    if (!textSelection) return;
    if (!splitSpeaker) {
      toast.error("Choose a speaker voice before splitting");
      return;
    }
    const line = lines.find((l) => l.id === textSelection.lineId);
    if (
      line &&
      isSplitInsideQuote(line.line_text, textSelection.start, textSelection.end)
    ) {
      toast.error(
        "Can't split inside quoted dialogue. Select the narration before the quote, the full quoted line (with quote marks), or turn on Move dialogue to next line."
      );
      return;
    }
    const { speaker_label, speaker_character_id } = resolveSpeaker(
      splitSpeaker,
      rosterCharacters,
      splitSpeakerHint
    );
    const idx = lines.findIndex((l) => l.id === textSelection.lineId);
    const nextLine = idx >= 0 && idx + 1 < lines.length ? lines[idx + 1]! : null;
    const canMergeTrailing =
      !!line &&
      !!nextLine &&
      trailingTextStartsDialogue(line.line_text, textSelection.end);
    const mergeTrailing = canMergeTrailing && mergeTrailingIntoNext;
    let trailing_speaker_label: string | undefined;
    let trailing_speaker_character_id: string | null | undefined;
    if (mergeTrailing && trailingSpeaker) {
      const trailing = resolveSpeaker(
        trailingSpeaker,
        rosterCharacters,
        trailingSpeakerHint
      );
      trailing_speaker_label = trailing.speaker_label;
      trailing_speaker_character_id = trailing.speaker_character_id;
    }
    setSplitBusy(true);
    try {
      const res = await fetchWithTimeout(`/api/books/${bookId}/lines/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          line_id: textSelection.lineId,
          start: textSelection.start,
          end: textSelection.end,
          speaker_label,
          speaker_character_id,
          merge_trailing_into_next: mergeTrailing || undefined,
          trailing_speaker_label,
          trailing_speaker_character_id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "Split failed");
      }
      const payload = data as {
        lines?: SplitLineRow[];
        inserted_count?: number;
        split_at_order?: number;
      };
      if (payload.lines && payload.lines.length > 0) {
        setLines((prev) =>
          mergeSplitIntoLines(
            prev,
            payload.lines!,
            rosterCharacters,
            payload.split_at_order ?? line?.line_order ?? 0,
            payload.inserted_count ?? 0
          )
        );
      }
      toast.success(
        mergeTrailing
          ? "Line split — dialogue added to the line below"
          : "Line split — new line added below"
      );
      setTextSelection(null);
      window.getSelection()?.removeAllRanges();
      void refreshUndoCount();
    } catch (e) {
      toast.error(operationErrorMessage(e, "Split"));
    } finally {
      setSplitBusy(false);
    }
  }

  async function applyLineReorder(draggedId: string, targetId: string) {
    if (draggedId === targetId || reorderBusy) return;

    const targetOrder = targetLineOrderForDrop(lines, draggedId, targetId);
    const reordered = reorderManuscriptLines(lines, draggedId, targetId);
    if (targetOrder == null || !reordered) return;

    const previousLines = lines;
    setLines(reordered);
    setReorderBusy(true);
    markSaving([draggedId], true);

    try {
      const res = await fetchWithTimeout(`/api/books/${bookId}/lines/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          line_id: draggedId,
          target_line_order: targetOrder,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "Reorder failed");
      }

      const orderMap = new Map(
        (
          data as { line_orders?: { id: string; line_order: number }[] }
        ).line_orders?.map((row) => [row.id, row.line_order]) ?? []
      );
      if (orderMap.size > 0) {
        setLines((prev) =>
          [...prev]
            .map((line) => ({
              ...line,
              line_order: orderMap.get(line.id) ?? line.line_order,
            }))
            .sort((a, b) => a.line_order - b.line_order)
        );
      }

      toast.success("Line moved");
      void refreshUndoCount();
      // Intentionally do NOT call router.refresh() here: the server response's
      // `line_orders` is authoritative and already applied above. Re-running the
      // server render can return stale ordering (or fail) and clobber the move.
    } catch (e) {
      setLines(previousLines);
      toast.error(operationErrorMessage(e, "Reorder"));
    } finally {
      setReorderBusy(false);
      markSaving([draggedId], false);
      setDraggingLineId(null);
      setDragOverLineId(null);
    }
  }

  async function applyMergeSelected() {
    const ids = [...selectedIds];
    if (!areSelectedLinesAdjacent(lines, selectedIds)) {
      toast.error("Select adjacent lines in the manuscript to merge");
      return;
    }

    // Apply the merge optimistically (mirrors the server: combine text into the
    // first line, drop the rest, renumber) so the result is visible immediately
    // instead of depending on a full server re-render.
    const selected = lines
      .filter((l) => ids.includes(l.id))
      .sort((a, b) => a.line_order - b.line_order);
    if (selected.length < 2) return;
    const first = selected[0]!;
    const mergedText = selected
      .map((l) => l.line_text.trim())
      .filter(Boolean)
      .join(" ");
    const keepFlag = selected.some((l) => l.flag_reason);
    const removeIds = new Set(selected.slice(1).map((l) => l.id));

    const previousLines = lines;
    setLines((prev) =>
      prev
        .filter((l) => !removeIds.has(l.id))
        .map((l) =>
          l.id === first.id
            ? {
                ...l,
                line_text: mergedText,
                human_reviewed: true,
                flag_reason: keepFlag ? first.flag_reason : null,
              }
            : l
        )
        .sort((a, b) => a.line_order - b.line_order)
        .map((l, i) => ({ ...l, line_order: i }))
    );
    setBulkSaving(true);

    try {
      const res = await fetchWithTimeout(`/api/books/${bookId}/lines/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_ids: ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "Merge failed");
      }
      toast.success(`Merged ${ids.length} lines into one`);
      clearSelection();
      void refreshUndoCount();
    } catch (e) {
      setLines(previousLines);
      toast.error(operationErrorMessage(e, "Merge"));
    } finally {
      setBulkSaving(false);
    }
  }

  async function confirmDeleteSelected() {
    const ids = [...selectedIds];
    const count = ids.length;
    setBulkSaving(true);
    setDeleteProgress(8);
    setDeleteStage(`Removing ${count.toLocaleString()} line${count === 1 ? "" : "s"}…`);

    const tick = window.setInterval(() => {
      setDeleteProgress((p) => (p < 72 ? p + 4 : p));
    }, 180);

    try {
      const res = await fetchWithTimeout(`/api/books/${bookId}/lines/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_ids: ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "Delete failed");
      }

      setDeleteProgress(92);
      setDeleteStage("Updating chapters…");

      const removed = new Set(ids);
      setLines((prev) =>
        prev
          .filter((l) => !removed.has(l.id))
          .sort((a, b) => a.line_order - b.line_order)
          .map((l, i) => ({ ...l, line_order: i }))
      );

      const chapters = (data as { chapters?: BookChapterRow[] }).chapters;
      if (chapters) setBookChapters(chapters);

      setDeleteProgress(100);
      setDeleteStage("Done");
      clearSelection();
      toast.success(
        `Removed ${((data as { deleted?: number }).deleted ?? count).toLocaleString()} lines from the manuscript`
      );
      setDeleteOpen(false);
      void refreshUndoCount();
    } catch (e) {
      toast.error(operationErrorMessage(e, "Delete"));
    } finally {
      window.clearInterval(tick);
      setBulkSaving(false);
      setDeleteProgress(0);
      setDeleteStage("");
    }
  }

  async function applyBulkExclude(excluded: boolean) {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkSaving(true);
    markSaving(ids, true);
    try {
      await bulkPatch(ids, { excluded_from_export: excluded });
      setLines((prev) =>
        prev.map((l) =>
          selectedIds.has(l.id) ? { ...l, excluded_from_export: excluded } : l
        )
      );
      toast.success(
        excluded
          ? `Excluded ${ids.length} lines from export`
          : `Included ${ids.length} lines in export`
      );
      clearSelection();
    } catch (e) {
      toast.error(operationErrorMessage(e, "Bulk update"));
    } finally {
      setBulkSaving(false);
      markSaving(ids, false);
    }
  }

  function toggleBulkExport() {
    const selected = lines.filter((l) => selectedIds.has(l.id));
    if (selected.length === 0) return;
    const allExcluded = selected.every((l) => l.excluded_from_export);
    void applyBulkExclude(!allExcluded);
  }

  function navigateChapter(direction: -1 | 1) {
    const navigable = chapters.filter((c) => c.id !== MANUSCRIPT_FULL_ID);
    if (navigable.length === 0) return;

    const currentIdx =
      chapterFilter === MANUSCRIPT_FULL_ID
        ? direction === 1
          ? -1
          : navigable.length
        : navigable.findIndex((c) => c.id === chapterFilter);

    const nextIdx = currentIdx + direction;
    if (nextIdx < 0 || nextIdx >= navigable.length) return;
    handleChapterChange(navigable[nextIdx]!.id);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "z" &&
        !e.shiftKey
      ) {
        if (!isEditableTarget(e.target)) {
          e.preventDefault();
          void applyUndo();
        }
        return;
      }

      if (isEditableTarget(e.target)) return;

      const command = findCommandForEvent(e, loadHotkeyConfig());
      if (!command) return;

      if (command === "showHelp") {
        e.preventDefault();
        setHotkeysOpen(true);
        return;
      }

      if (command === "clearSelection") {
        if (textSelection) {
          e.preventDefault();
          setTextSelection(null);
          window.getSelection()?.removeAllRanges();
        } else if (selectedIds.size > 0) {
          e.preventDefault();
          clearSelection();
        }
        return;
      }

      if (command === "jumpLine") {
        e.preventDefault();
        jumpInputRef.current?.focus();
        return;
      }

      if (command === "prevChapter") {
        e.preventDefault();
        navigateChapter(-1);
        return;
      }

      if (command === "nextChapter") {
        e.preventDefault();
        navigateChapter(1);
        return;
      }

      if (command === "splitSelection" && textSelection && splitSpeaker) {
        e.preventDefault();
        void applyTextSplit();
        return;
      }

      if (selectedIds.size === 0) return;

      if (command === "assignSpeaker") {
        e.preventDefault();
        const trigger = document.querySelector<HTMLButtonElement>(
          "[data-hotkey-speaker] button"
        );
        trigger?.click();
        return;
      }

      if (command === "merge" && areSelectedLinesAdjacent(lines, selectedIds)) {
        e.preventDefault();
        void applyMergeSelected();
        return;
      }

      if (command === "delete") {
        e.preventDefault();
        setDeleteOpen(true);
        return;
      }

      if (command === "toggleExport") {
        e.preventDefault();
        toggleBulkExport();
        return;
      }

      if (command === "chapterStart" && selectedIds.size === 1) {
        e.preventDefault();
        openChapterDialog();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers read latest state
  }, [
    applyUndo,
    selectedIds,
    textSelection,
    splitSpeaker,
    lines,
    chapters,
    chapterFilter,
  ]);

  const textSelectionLine = textSelection
    ? lines.find((l) => l.id === textSelection.lineId)
    : null;
  const textSelectionLineIndex = textSelectionLine
    ? lines.findIndex((l) => l.id === textSelectionLine.id)
    : -1;
  const textSelectionNextLine =
    textSelectionLineIndex >= 0 && textSelectionLineIndex + 1 < lines.length
      ? lines[textSelectionLineIndex + 1]!
      : null;
  const canMergeTrailingIntoNext =
    !!textSelectionLine &&
    !!textSelectionNextLine &&
    !!textSelection &&
    trailingTextStartsDialogue(
      textSelectionLine.line_text,
      textSelection.end
    );

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem)] w-full max-w-none">
      <div className={`shrink-0 ${controlsOpen ? "pb-3" : "pb-2"}`}>
        <Link
          href={`/books/${bookId}`}
          className="text-body-sm text-teal hover:underline"
        >
          ← {bookTitle}
        </Link>
        <div className="mt-3 flex items-center justify-between gap-3">
          <h1 className="font-serif text-h1">Speaker studio</h1>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={toggleControls}
            aria-expanded={controlsOpen}
            className="shrink-0"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
            {controlsOpen ? "Hide controls" : "Show controls"}
            <ChevronDown
              className={`h-3.5 w-3.5 ml-1.5 transition-transform ${
                controlsOpen ? "rotate-180" : ""
              }`}
            />
          </Button>
        </div>
        {controlsOpen && (
          <p className="mt-2 text-body-sm text-slate max-w-2xl">
            Line-by-line speaker and voice editing. Click line text to rewrite,
            retype, or delete — cut, copy, and paste work as usual. Use the
            checkbox to select lines for merge, delete, or bulk actions. To
            remove back matter, use{" "}
            <Link
              href={`/books/${bookId}/cleanup`}
              className="text-burgundy underline underline-offset-2"
            >
              Manuscript editor
            </Link>
            . Highlight text to split lines. Drag the grip handle on each line to
            reorder.
          </p>
        )}
        <p className="mt-2 text-body-sm text-slate tabular-nums">
          {stats.total.toLocaleString()} lines ·{" "}
          {stats.flagged.toLocaleString()} flagged ·{" "}
          {stats.excluded.toLocaleString()} excluded from export
          {filtered.length !== stats.total && (
            <> · showing {filtered.length.toLocaleString()}</>
          )}
          {chapters.length > 0 && (
            <>
              {" "}
              · {chapters.length} chapters
              {activeChapter && (
                <>
                  {" "}
                  · viewing <span className="text-ink">{activeChapter.title}</span>
                </>
              )}
            </>
          )}
        </p>

        {controlsOpen && (
        <>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label htmlFor="ms-search" className="text-xs">
              Search text
            </Label>
            <Input
              id="ms-search"
              className="mt-1 h-9"
              placeholder="Find a word or speaker…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Speaker</Label>
            <Select value={speakerFilter} onValueChange={setSpeakerFilter}>
              <SelectTrigger className="mt-1 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All speakers</SelectItem>
                {speakers.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="ms-jump" className="text-xs">
              Jump to line #
            </Label>
            <div className="mt-1 flex gap-2">
              <Input
                id="ms-jump"
                ref={jumpInputRef}
                className="h-9"
                inputMode="numeric"
                placeholder="e.g. 1204"
                value={jumpLine}
                onChange={(e) => setJumpLine(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && jumpToLineOrder()}
              />
              <Button
                type="button"
                variant="secondary"
                className="h-9 shrink-0"
                onClick={jumpToLineOrder}
              >
                Go
              </Button>
            </div>
          </div>
          <div className="flex flex-col justify-end gap-2 text-body-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={flaggedOnly}
                onChange={(e) => setFlaggedOnly(e.target.checked)}
                className="rounded"
              />
              Flagged only
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showExcluded}
                onChange={(e) => setShowExcluded(e.target.checked)}
                className="rounded"
              />
              Show excluded lines
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={compactView}
                onChange={(e) => setCompactView(e.target.checked)}
                className="rounded"
              />
              Compact view (group same speaker)
            </label>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <UndoEditButton
            undoCount={undoCount}
            busy={undoBusy}
            onUndo={() => void applyUndo()}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={aiReviewLoading || lines.length === 0}
            onClick={() => setAiSetupOpen(true)}
          >
            {aiReviewLoading ? "Running AI review…" : "Review lines with AI"}
          </Button>
          <SaveCheckpointButton
            bookId={bookId}
            defaultLabel={
              activeChapter
                ? `Speaker studio — ${activeChapter.title}`
                : "Speaker studio progress"
            }
          />
          <Button type="button" variant="outline" size="sm" onClick={selectAllFiltered}>
            Select all shown
          </Button>
          {selectedIds.size > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={clearSelection}>
              Clear selection ({selectedIds.size})
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href={`/books/${bookId}/listen`}>Listen mode</Link>
          </Button>
          {missingSpeechTagCount > 0 && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={repairTagsBusy}
              onClick={() => void repairSpeechTags()}
            >
              {repairTagsBusy
                ? "Restoring tags…"
                : `Insert ${missingSpeechTagCount.toLocaleString()} missing speech tag${missingSpeechTagCount === 1 ? "" : "s"}`}
            </Button>
          )}
        </div>
        </>
        )}
        {aiReviewLoading && !aiPreviewOpen && (
          <div className="mt-3 rounded-lg border border-burgundy/30 bg-burgundy/5 px-4 py-3 space-y-2 max-w-xl">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-burgundy shrink-0" />
              <p className="text-body-sm text-burgundy flex-1">
                {aiReviewMessage || "Claude is reviewing…"}
              </p>
              <span className="text-body-sm text-slate tabular-nums">
                {aiReviewProgress}%
              </span>
            </div>
            <Progress value={aiReviewProgress} active className="h-2.5" />
          </div>
        )}
      </div>

      <div className="flex flex-1 min-h-0 gap-3 flex-col lg:flex-row">
        {lines.length > 0 && (
          <ManuscriptChapterNav
            chapters={chapters}
            activeChapterId={chapterFilter}
            onChapterChange={handleChapterChange}
            onRebuildFromHeadings={() => void rebuildChaptersFromHeadings()}
            rebuildBusy={chapterSaving}
          />
        )}

        <div className="flex-1 min-h-0 flex flex-col gap-2">
      {selectedIds.size > 0 && (
        <ManuscriptSelectionToolbar
          bookId={bookId}
          selectedCount={selectedIds.size}
          bulkSpeaker={bulkSpeaker}
          onBulkSpeakerChange={(id, character) => {
            setBulkSpeaker(id);
            setBulkSpeakerHint(character);
          }}
          onCharacterCreated={handleCharacterCreated}
          characters={rosterPick}
          canMerge={areSelectedLinesAdjacent(lines, selectedIds)}
          canChapterStart={selectedIds.size === 1}
          busy={bulkSaving}
          onApplySpeaker={() => void applyBulkSpeaker()}
          onToggleExport={toggleBulkExport}
          onMerge={() => void applyMergeSelected()}
          onChapterStart={openChapterDialog}
          onDelete={() => setDeleteOpen(true)}
          onClear={clearSelection}
          onShowHelp={() => setHotkeysOpen(true)}
        />
      )}
      {compactView ? (
        <VirtualManuscriptList
          items={blocks.map((b) => ({ ...b, id: b.key }))}
          scrollToIndex={scrollToIndex}
          scrollKey={scrollKey}
          rowHeight={152}
          className="flex-1 min-h-0 border border-border-muted rounded-lg bg-cream/50 px-3 py-2"
          renderRow={(block) => (
            <ManuscriptCompactBlockRow
              bookId={bookId}
              block={block}
              characters={rosterPick}
              onCharacterCreated={handleCharacterCreated}
              onCharacterDeleted={handleCharacterDeleted}
              onCharacterMerged={handleCharacterMerged}
              isSelected={block.line_ids.every((id) => selectedIds.has(id))}
              isHighlighted={block.line_ids.includes(highlightLineId ?? "")}
              isSaving={block.line_ids.some((id) => savingIds.has(id))}
              isPlaying={block.line_ids.includes(playingId ?? "")}
              isPlayLoading={block.line_ids.some((id) => loadingId === id)}
              onHighlight={handleHighlightBlock}
              onSelect={handleToggleSelectBlock}
              onSpeakerChange={handleBlockSpeakerChange}
              onToggleExclude={handleBlockToggleExclude}
              onPlay={handleBlockPlay}
              onCastVoice={handleBlockCastVoice}
              onBlockTextSave={handleBlockTextSave}
            />
          )}
        />
      ) : (
        <VirtualManuscriptList
          items={filtered}
          scrollToIndex={scrollToIndex}
          scrollKey={scrollKey}
          className="flex-1 min-h-0 border border-border-muted rounded-lg bg-cream/50 px-3 py-2"
          rowHeight={152}
          renderRow={(line) => (
            <ManuscriptLineRow
              bookId={bookId}
              line={line}
              characters={rosterPick}
              onCharacterCreated={handleCharacterCreated}
              onCharacterDeleted={handleCharacterDeleted}
              onCharacterMerged={handleCharacterMerged}
              isSelected={selectedIds.has(line.id)}
              isHighlighted={highlightLineId === line.id}
              isSaving={savingIds.has(line.id)}
              isPlaying={playingId === line.id}
              isPlayLoading={loadingId === line.id}
              onHighlight={handleHighlightLine}
              onSelect={handleToggleSelect}
              onSpeakerChange={handleSpeakerChange}
              onToggleExclude={handleToggleExclude}
              onClearFlag={handleClearFlag}
              onLineTextSave={handleLineTextSave}
              onPlay={handlePlay}
              onCastVoice={handleCastVoice}
              isChapterStart={chapterStartOrders.has(line.line_order)}
              selectionEnabled={!compactView}
              speechTagAfter={speechTagsByLineId[line.id] ?? null}
              reorderEnabled={!compactView && !reorderBusy}
              isDragging={draggingLineId === line.id}
              isDragOver={
                dragOverLineId === line.id && draggingLineId !== line.id
              }
              onReorderDragStart={(id) => setDraggingLineId(id)}
              onReorderDragEnd={() => {
                setDraggingLineId(null);
                setDragOverLineId(null);
              }}
              onReorderDragOver={(id) => setDragOverLineId(id)}
              onReorderDrop={(targetId) => {
                if (draggingLineId) {
                  void applyLineReorder(draggingLineId, targetId);
                }
              }}
              onTextSelected={(payload) => {
                if (compactView) {
                  toast.message(
                    "Turn off compact view to split text within a line"
                  );
                  return;
                }
                setTextSelection(payload);
              }}
            />
          )}
        />
      )}
        </div>
      </div>

      {textSelection && !compactView && textSelectionLine && (
        <LineSelectionToolbar
          bookId={bookId}
          selection={textSelection}
          lineText={textSelectionLine.line_text}
          characters={rosterPick}
          speakerValue={splitSpeaker}
          onSpeakerChange={(value, character) => {
            setSplitSpeaker(value);
            setSplitSpeakerHint(character);
          }}
          mergeTrailingIntoNext={mergeTrailingIntoNext}
          onMergeTrailingIntoNextChange={setMergeTrailingIntoNext}
          canMergeTrailingIntoNext={canMergeTrailingIntoNext}
          trailingSpeakerValue={trailingSpeaker}
          onTrailingSpeakerChange={(value, character) => {
            setTrailingSpeaker(value);
            setTrailingSpeakerHint(character);
          }}
          onCharacterCreated={handleCharacterCreated}
          onSplit={() => void applyTextSplit()}
          onDismiss={() => {
            setTextSelection(null);
            window.getSelection()?.removeAllRanges();
          }}
          busy={splitBusy}
        />
      )}

      <ManuscriptHotkeysDialog
        open={hotkeysOpen}
        onOpenChange={setHotkeysOpen}
      />

      <Dialog open={chapterDialogOpen} onOpenChange={setChapterDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chapter start</DialogTitle>
            <DialogDescription>
              Mark the selected line as the beginning of a new chapter. Use the
              line text as the title or type your own (e.g. &ldquo;Chapter
              12&rdquo;).
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="chapter-title" className="text-xs">
              Chapter title
            </Label>
            <Input
              id="chapter-title"
              className="mt-1"
              value={chapterTitle}
              onChange={(e) => setChapterTitle(e.target.value)}
              placeholder="Chapter title"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              disabled={chapterSaving}
              onClick={() => setChapterDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={chapterSaving || !chapterTitle.trim()}
              onClick={() => void confirmChapterStart()}
            >
              {chapterSaving ? "Saving…" : "Save chapter"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!bulkSaving) setDeleteOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete from manuscript?</DialogTitle>
            <DialogDescription>
              Permanently remove {selectedIds.size.toLocaleString()} selected
              line{selectedIds.size === 1 ? "" : "s"} from this book. Use this
              for recipes, ads, or back matter you do not want in the audiobook.
              This cannot be undone (re-run analysis will rebuild from the docx).
            </DialogDescription>
          </DialogHeader>

          {bulkSaving && (
            <div className="space-y-2 py-1">
              <div className="flex justify-between text-body-sm text-slate">
                <span>{deleteStage || "Working…"}</span>
                <span className="tabular-nums">{deleteProgress}%</span>
              </div>
              <Progress value={deleteProgress} className="h-2" />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              disabled={bulkSaving}
              onClick={() => setDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="bg-dark-red hover:bg-dark-red/90"
              disabled={bulkSaving}
              onClick={() => void confirmDeleteSelected()}
            >
              {bulkSaving ? "Deleting…" : "Delete lines"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AiReviewSetupDialog
        bookId={bookId}
        open={aiSetupOpen}
        onOpenChange={setAiSetupOpen}
        scope={aiScope}
        scopeLabel={aiScopeLabelText}
        onLaunch={(opts) => void launchAiReview(opts)}
        busy={aiReviewLoading}
      />

      <AiReviewPreviewDialog
        bookId={bookId}
        open={aiPreviewOpen}
        onOpenChange={setAiPreviewOpen}
        proposals={aiProposals}
        eligibility={aiEligibility}
        loading={aiPreviewLoading}
        progress={aiReviewProgress}
        progressMessage={aiReviewMessage}
        respectHumanReviewed={aiRespectHuman}
        characters={speakerRoster}
        onCharacterCreated={handleCharacterCreated}
        onApplied={handleAiApplied}
      />

      {pickerChar && (
        <VoicePickerDialog
          character={pickerChar}
          sampleLines={pickerSamples}
          open={!!pickerChar}
          onOpenChange={(open) => {
            if (!open) setPickerChar(null);
          }}
          onSaved={() => {
            setPickerChar(null);
            router.refresh();
          }}
          assignedVoices={seriesVoiceAssignments}
        />
      )}
    </div>
  );
}
