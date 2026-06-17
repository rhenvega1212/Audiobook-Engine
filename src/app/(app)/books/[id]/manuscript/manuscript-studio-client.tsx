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
import { Loader2 } from "lucide-react";
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
import { voicePlaybackFromCharacter } from "@/lib/elevenlabs/voice-cast";
import { LineSelectionToolbar } from "@/components/manuscript/line-selection-toolbar";
import { ManuscriptSelectionToolbar } from "@/components/manuscript/manuscript-selection-toolbar";
import { ManuscriptHotkeysDialog } from "@/components/manuscript/manuscript-hotkeys-dialog";
import type { TextSelectionPayload } from "@/lib/manuscript/text-selection";
import { isSplitInsideQuote } from "@/lib/engine/quote-spans";
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
import type { AiReviewEligibilityStats } from "@/lib/books/ai-review-eligibility";
import type { AiReviewScope } from "@/lib/books/ai-review-scope";

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
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { playingId, loadingId, playLine } = useLineAudioPlayer();
  const [lines, setLines] = useState(initialLines);
  const [rosterCharacters, setRosterCharacters] = useState(characters);

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
    (): SpeakerCharacter[] =>
      rosterCharacters.map((c) => ({
        id: c.id,
        canonical_name: c.canonical_name,
        aliases: c.aliases ?? [],
        elevenlabs_voice_id: c.elevenlabs_voice_id,
        elevenlabs_voice_name: c.elevenlabs_voice_name,
      })),
    [rosterCharacters]
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

  const rosterPick = useMemo(
    () =>
      rosterCharacters.map((c) => ({
        id: c.id,
        canonical_name: c.canonical_name,
        aliases: c.aliases,
      })),
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
    const res = await fetch(`/api/books/${bookId}/lines/${lineId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error ?? "Save failed");
    }
    return true;
  }

  async function bulkPatch(
    lineIds: string[],
    body: Record<string, unknown>
  ): Promise<boolean> {
    const res = await fetch(`/api/books/${bookId}/lines/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ line_ids: lineIds, ...body }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error ?? "Bulk update failed");
    }
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
      toast.error(e instanceof Error ? e.message : "Save failed");
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
      toast.error(e instanceof Error ? e.message : "Save failed");
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
      toast.error(e instanceof Error ? e.message : "Save failed");
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
      toast.error(e instanceof Error ? e.message : "Save failed");
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
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      markSaving([line.id], false);
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

  function handleAiApplied(applied: number) {
    toast.success(
      applied > 0
        ? `Applied ${applied} speaker update${applied === 1 ? "" : "s"}`
        : "No changes applied"
    );
    router.refresh();
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
      const res = await fetch(`/api/books/${bookId}/chapters`, {
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
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not set chapter");
    } finally {
      setChapterSaving(false);
    }
  }

  async function rebuildChaptersFromHeadings() {
    setChapterSaving(true);
    try {
      const res = await fetch(`/api/books/${bookId}/chapters`, {
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
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rebuild failed");
    } finally {
      setChapterSaving(false);
    }
  }

  async function repairSpeechTags() {
    setRepairTagsBusy(true);
    try {
      const res = await fetch(`/api/books/${bookId}/repair-speech-tags`, {
        method: "POST",
      });
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
      toast.error(e instanceof Error ? e.message : "Repair failed");
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
      toast.error(e instanceof Error ? e.message : "Bulk update failed");
    } finally {
      setBulkSaving(false);
      markSaving(ids, false);
    }
  }

  async function applyTextSplit() {
    if (!textSelection || !splitSpeaker) return;
    const line = lines.find((l) => l.id === textSelection.lineId);
    if (
      line &&
      isSplitInsideQuote(line.line_text, textSelection.start, textSelection.end)
    ) {
      toast.error(
        "Can't split inside quoted dialogue. Select text outside quotes or the full spoken line."
      );
      return;
    }
    const { speaker_label, speaker_character_id } = resolveSpeaker(
      splitSpeaker,
      rosterCharacters,
      splitSpeakerHint
    );
    setSplitBusy(true);
    try {
      const res = await fetch(`/api/books/${bookId}/lines/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          line_id: textSelection.lineId,
          start: textSelection.start,
          end: textSelection.end,
          speaker_label,
          speaker_character_id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "Split failed");
      }
      toast.success("Selection split into separate lines");
      setTextSelection(null);
      window.getSelection()?.removeAllRanges();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Split failed");
    } finally {
      setSplitBusy(false);
    }
  }

  async function applyMergeSelected() {
    const ids = [...selectedIds];
    if (!areSelectedLinesAdjacent(lines, selectedIds)) {
      toast.error("Select adjacent lines in the manuscript to merge");
      return;
    }
    setBulkSaving(true);
    try {
      const res = await fetch(`/api/books/${bookId}/lines/merge`, {
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
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Merge failed");
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
      const res = await fetch(`/api/books/${bookId}/lines/delete`, {
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
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
      toast.error(e instanceof Error ? e.message : "Bulk update failed");
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

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-7xl mx-auto w-full px-2 sm:px-0">
      <div className="shrink-0 pb-4">
        <Link
          href={`/books/${bookId}`}
          className="text-body-sm text-teal hover:underline"
        >
          ← {bookTitle}
        </Link>
        <h1 className="font-serif text-h1 mt-3">Speaker studio</h1>
        <p className="mt-2 text-body-sm text-slate max-w-2xl">
          Line-by-line speaker and voice editing. Use the checkbox to select lines
          for merge, delete, or bulk actions; click line text to focus. To remove
          back matter, use{" "}
          <Link
            href={`/books/${bookId}/cleanup`}
            className="text-burgundy underline underline-offset-2"
          >
            Manuscript cleanup
          </Link>
          . Highlight text to split lines.
        </p>
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

      <div className="flex flex-1 min-h-0 gap-4 flex-col lg:flex-row">
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
          rowHeight={140}
          className="flex-1 min-h-0 border border-border-muted rounded-lg bg-cream/50 px-2 py-2"
          renderRow={(block) => (
            <ManuscriptCompactBlockRow
              bookId={bookId}
              block={block}
              characters={rosterPick}
              onCharacterCreated={handleCharacterCreated}
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
            />
          )}
        />
      ) : (
        <VirtualManuscriptList
          items={filtered}
          scrollToIndex={scrollToIndex}
          scrollKey={scrollKey}
          className="flex-1 min-h-0 border border-border-muted rounded-lg bg-cream/50 px-2 py-2"
          renderRow={(line) => (
            <ManuscriptLineRow
              bookId={bookId}
              line={line}
              characters={rosterPick}
              onCharacterCreated={handleCharacterCreated}
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
              onPlay={handlePlay}
              onCastVoice={handleCastVoice}
              isChapterStart={chapterStartOrders.has(line.line_order)}
              selectionEnabled={!compactView}
              speechTagAfter={speechTagsByLineId[line.id] ?? null}
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
