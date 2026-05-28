"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Loader2, Plus, Search } from "lucide-react";
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
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function pick(id: string, char?: SpeakerCharacter) {
    onValueChange(id, char);
    setOpen(false);
    setSearch("");
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

      <ul className="max-h-56 overflow-y-auto py-1">
        {showNarrator && (
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

        {filtered.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-sm text-left hover:bg-warm-sand",
                value === c.id && "bg-warm-sand"
              )}
              onClick={() => pick(c.id, c)}
            >
              {value === c.id && (
                <Check className="h-3.5 w-3.5 text-teal shrink-0" />
              )}
              <span className={cn("truncate", value === c.id ? "" : "pl-5")}>
                {c.canonical_name}
              </span>
            </button>
          </li>
        ))}

        {showUnknown && (
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

      {search.trim() && !exactMatch && (
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
