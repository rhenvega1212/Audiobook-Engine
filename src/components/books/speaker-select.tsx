"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronDown,
  GitMerge,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  NARRATOR_VALUE,
  UNKNOWN_VALUE,
} from "@/lib/manuscript/speaker-utils";

export type SpeakerCharacter = {
  id: string;
  canonical_name: string;
  aliases?: string[];
  elevenlabs_voice_id?: string | null;
  elevenlabs_voice_name?: string | null;
};

function sortByName(chars: SpeakerCharacter[]) {
  return [...chars].sort((a, b) =>
    a.canonical_name.localeCompare(b.canonical_name, undefined, {
      sensitivity: "base",
    })
  );
}

export function SpeakerSelect({
  bookId,
  value,
  onValueChange,
  characters,
  onCharacterCreated,
  onCharacterDeleted,
  onCharacterMerged,
  disabled = false,
  className,
  placeholder = "Select speaker",
  size = "default",
  includeUnknown = false,
  usePortal = true,
  onTriggerClick,
}: {
  bookId: string;
  value: string;
  onValueChange: (characterId: string, character?: SpeakerCharacter) => void;
  characters: SpeakerCharacter[];
  onCharacterCreated?: (character: SpeakerCharacter) => void;
  /** When provided, each character can be deleted from the dropdown. */
  onCharacterDeleted?: (characterId: string) => void;
  /** When provided, a character can be merged into another from the dropdown. */
  onCharacterMerged?: (sourceId: string, targetId: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  size?: "default" | "compact";
  includeUnknown?: boolean;
  /** Render menu in a portal so it isn't clipped by scroll containers */
  usePortal?: boolean;
  onTriggerClick?: (e: React.MouseEvent) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const rosterWithoutNarrator = useMemo(
    () =>
      sortByName(
        characters.filter(
          (c) => c.canonical_name.toLowerCase() !== "narrator"
        )
      ),
    [characters]
  );

  const q = search.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return rosterWithoutNarrator;
    return rosterWithoutNarrator.filter((c) =>
      c.canonical_name.toLowerCase().includes(q)
    );
  }, [rosterWithoutNarrator, q]);

  const showNarrator =
    !q || "narrator".includes(q) || q.includes("narr");

  const showUnknown =
    includeUnknown &&
    (!q ||
      q === "unknown" ||
      "unknown".startsWith(q) ||
      q.startsWith("unknown"));

  const exactMatch = useMemo(() => {
    if (!q) return true;
    if (q === "narrator") return true;
    if (q === "unknown") return true;
    return rosterWithoutNarrator.some(
      (c) => c.canonical_name.toLowerCase() === q
    );
  }, [rosterWithoutNarrator, q]);

  const displayLabel = useMemo(() => {
    if (value === NARRATOR_VALUE) return "Narrator";
    if (value === UNKNOWN_VALUE) return "UNKNOWN";
    const char = characters.find((c) => c.id === value);
    return char?.canonical_name ?? placeholder;
  }, [value, characters, placeholder]);

  useEffect(() => {
    if (!open) return;
    function positionMenu() {
      const el = rootRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const width = Math.max(rect.width, 256);
      let left = rect.left;
      if (left + width > window.innerWidth - 8) {
        left = window.innerWidth - width - 8;
      }
      setMenuStyle({
        position: "fixed",
        top: rect.bottom + 4,
        left: Math.max(8, left),
        width,
        zIndex: 9999,
      });
    }
    positionMenu();
    window.addEventListener("scroll", positionMenu, true);
    window.addEventListener("resize", positionMenu);
    return () => {
      window.removeEventListener("scroll", positionMenu, true);
      window.removeEventListener("resize", positionMenu);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (
        rootRef.current?.contains(t) ||
        menuRef.current?.contains(t)
      ) {
        return;
      }
      setOpen(false);
      setSearch("");
      setConfirmDeleteId(null);
      setMergeSourceId(null);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function pick(id: string, char?: SpeakerCharacter) {
    onValueChange(id, char);
    setOpen(false);
    setSearch("");
    setConfirmDeleteId(null);
    setMergeSourceId(null);
  }

  async function mergeCharacter(sourceId: string, targetId: string) {
    setMerging(true);
    try {
      const res = await fetch(`/api/characters/${sourceId}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_id: targetId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ?? "Could not merge characters"
        );
      }
      const info = data as {
        source_name?: string;
        target_name?: string;
        reassigned_lines?: number;
      };
      onCharacterMerged?.(sourceId, targetId);
      const n = info.reassigned_lines ?? 0;
      toast.success(
        `Merged “${info.source_name}” into “${info.target_name}”${
          n > 0
            ? ` · ${n.toLocaleString()} line${n === 1 ? "" : "s"} updated`
            : ""
        }`
      );
      setMergeSourceId(null);
      setOpen(false);
      setSearch("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not merge characters");
    } finally {
      setMerging(false);
    }
  }

  async function deleteCharacter(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/characters/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ?? "Could not delete character"
        );
      }
      const reassigned = (data as { reassigned_lines?: number }).reassigned_lines ?? 0;
      onCharacterDeleted?.(id);
      toast.success(
        reassigned > 0
          ? `Deleted character · ${reassigned.toLocaleString()} line${
              reassigned === 1 ? "" : "s"
            } reset to UNKNOWN`
          : "Character deleted"
      );
      setConfirmDeleteId(null);
      setOpen(false);
      setSearch("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete character");
    } finally {
      setDeletingId(null);
    }
  }

  async function addCharacter() {
    const name = search.trim();
    if (!name || name.toLowerCase() === "narrator") {
      pick(NARRATOR_VALUE);
      return;
    }
    if (name.toLowerCase() === "unknown") {
      pick(UNKNOWN_VALUE);
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`/api/books/${bookId}/characters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canonical_name: name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ?? "Could not add character"
        );
      }
      const created = data as SpeakerCharacter;
      onCharacterCreated?.(created);
      // Assign immediately using the created record (roster state may lag)
      onValueChange(created.id, created);
      setOpen(false);
      setSearch("");
      toast.success(
        `Added "${created.canonical_name}" and assigned to this line`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add character");
    } finally {
      setCreating(false);
    }
  }

  const menu = open ? (
    <div
      ref={menuRef}
      className="rounded-md border border-border bg-bone shadow-lg overflow-hidden"
      style={usePortal ? menuStyle : undefined}
    >
      <div className="p-2 border-b border-border-muted">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate" />
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search or type new name…"
            className="pl-8 h-9"
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" && !exactMatch && search.trim()) {
                e.preventDefault();
                void addCharacter();
              }
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </div>

      {mergeSourceId && (
        <div className="flex items-center justify-between gap-2 border-b border-border-muted bg-warm-sand/60 px-3 py-2 text-xs">
          <span className="min-w-0 truncate">
            Merge{" "}
            <span className="font-medium">
              &ldquo;
              {characters.find((c) => c.id === mergeSourceId)?.canonical_name}
              &rdquo;
            </span>{" "}
            into… pick a character
            {merging && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}
          </span>
          <button
            type="button"
            className="shrink-0 text-slate hover:text-ink"
            onClick={(e) => {
              e.stopPropagation();
              setMergeSourceId(null);
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <ul className="max-h-56 overflow-y-auto py-1">
        {showNarrator && !mergeSourceId && (
          <li>
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-sm text-left hover:bg-warm-sand",
                value === NARRATOR_VALUE && "bg-warm-sand"
              )}
              onClick={() => pick(NARRATOR_VALUE)}
            >
              {value === NARRATOR_VALUE && (
                <Check className="h-3.5 w-3.5 text-teal shrink-0" />
              )}
              <span className={value === NARRATOR_VALUE ? "" : "pl-5"}>
                Narrator
              </span>
            </button>
          </li>
        )}

        {filtered.map((c) => {
          const isMergeSource = mergeSourceId === c.id;
          const inMergeMode = mergeSourceId !== null;
          return (
          <li key={c.id} className="group flex items-center">
            <button
              type="button"
              disabled={isMergeSource || merging}
              className={cn(
                "flex flex-1 min-w-0 items-center gap-2 px-3 py-2 text-sm text-left hover:bg-warm-sand disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent",
                value === c.id && !inMergeMode && "bg-warm-sand"
              )}
              onClick={() => {
                if (inMergeMode) {
                  if (!isMergeSource) void mergeCharacter(mergeSourceId, c.id);
                  return;
                }
                pick(c.id, c);
              }}
            >
              {value === c.id && !inMergeMode && (
                <Check className="h-3.5 w-3.5 text-teal shrink-0" />
              )}
              <span
                className={cn(
                  "truncate",
                  value === c.id && !inMergeMode ? "" : "pl-5"
                )}
              >
                {c.canonical_name}
              </span>
              {isMergeSource && (
                <span className="ml-auto text-[11px] text-slate">merging…</span>
              )}
            </button>
            {!inMergeMode && onCharacterMerged && (
              <button
                type="button"
                title="Merge into another character"
                aria-label={`Merge ${c.canonical_name} into another character`}
                className="shrink-0 px-1.5 py-2 text-slate opacity-0 transition-opacity hover:text-teal focus:opacity-100 group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDeleteId(null);
                  setMergeSourceId(c.id);
                  setSearch("");
                }}
              >
                <GitMerge className="h-3.5 w-3.5" />
              </button>
            )}
            {!inMergeMode &&
              onCharacterDeleted &&
              (confirmDeleteId === c.id ? (
                <span className="flex shrink-0 items-center gap-1.5 pr-2">
                  <button
                    type="button"
                    className="text-[11px] font-medium text-danger hover:underline disabled:opacity-50"
                    disabled={deletingId === c.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      void deleteCharacter(c.id);
                    }}
                  >
                    {deletingId === c.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Delete"
                    )}
                  </button>
                  <button
                    type="button"
                    className="text-[11px] text-slate hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(null);
                    }}
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  title="Delete character"
                  aria-label={`Delete ${c.canonical_name}`}
                  className="shrink-0 px-2 py-2 text-slate opacity-0 transition-opacity hover:text-danger focus:opacity-100 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDeleteId(c.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ))}
          </li>
          );
        })}

        {showUnknown && !mergeSourceId && (
          <li>
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-sm text-left hover:bg-warm-sand",
                value === UNKNOWN_VALUE && "bg-warm-sand"
              )}
              onClick={() => pick(UNKNOWN_VALUE)}
            >
              {value === UNKNOWN_VALUE && (
                <Check className="h-3.5 w-3.5 text-teal shrink-0" />
              )}
              <span className={value === UNKNOWN_VALUE ? "" : "pl-5"}>
                UNKNOWN
              </span>
            </button>
          </li>
        )}

        {!showNarrator && filtered.length === 0 && !showUnknown && !q && (
          <li className="px-3 py-2 text-sm text-slate">No characters yet</li>
        )}

        {q && filtered.length === 0 && !showNarrator && !showUnknown && (
          <li className="px-3 py-2 text-sm text-slate">No matches</li>
        )}
      </ul>

      {search.trim() && !exactMatch && !mergeSourceId && (
        <div className="border-t border-border-muted p-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full justify-start gap-2"
            disabled={creating}
            onClick={(e) => {
              e.stopPropagation();
              void addCharacter();
            }}
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add &ldquo;{search.trim()}&rdquo; as character
          </Button>
        </div>
      )}
    </div>
  ) : null;

  const isCompact = size === "compact";

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        className={cn(
          "justify-between font-normal bg-bone",
          isCompact
            ? "h-7 w-[min(100%,11rem)] text-[11px] px-2"
            : "w-full h-10"
        )}
        onClick={(e) => {
          onTriggerClick?.(e);
          if (!disabled) setOpen((o) => !o);
        }}
      >
        <span className="truncate text-left flex-1">{displayLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60 ml-1" />
      </Button>

      {usePortal && typeof document !== "undefined"
        ? createPortal(menu, document.body)
        : open && (
            <div className="absolute z-50 mt-1 w-full min-w-[16rem]">{menu}</div>
          )}
    </div>
  );
}

export function resolveSpeakerIdFromLine(
  speakerLabel: string,
  speakerCharacterId: string | null | undefined,
  characters: SpeakerCharacter[]
): string {
  if (speakerCharacterId) return speakerCharacterId;
  if (speakerLabel === "Narrator") return NARRATOR_VALUE;
  if (speakerLabel === "UNKNOWN") return UNKNOWN_VALUE;
  const match = characters.find(
    (c) =>
      c.canonical_name === speakerLabel ||
      (c.aliases ?? []).some((a) => a === speakerLabel)
  );
  return match?.id ?? UNKNOWN_VALUE;
}

export function resolveLineSpeakerPayload(
  speakerId: string,
  characters: SpeakerCharacter[],
  fallbackLabel?: string,
  hint?: SpeakerCharacter
): { speaker_character_id: string | null; speaker_label: string } {
  if (speakerId === NARRATOR_VALUE) {
    return { speaker_character_id: null, speaker_label: "Narrator" };
  }
  if (speakerId === UNKNOWN_VALUE) {
    return { speaker_character_id: null, speaker_label: "UNKNOWN" };
  }
  const char =
    characters.find((c) => c.id === speakerId) ??
    (hint?.id === speakerId ? hint : undefined);
  if (char) {
    return {
      speaker_character_id: char.id,
      speaker_label: char.canonical_name,
    };
  }
  return {
    speaker_character_id: null,
    speaker_label: fallbackLabel ?? "UNKNOWN",
  };
}
