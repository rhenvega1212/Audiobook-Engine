"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { DetectedCharacter } from "@/lib/characters/match-status";
import type { Character } from "@/lib/types/database";

function characterMergeLabel(c: Character) {
  return c.elevenlabs_voice_name
    ? `${c.canonical_name} · ${c.elevenlabs_voice_name}`
    : c.canonical_name;
}

export function CharacterCastActions({
  bookId,
  detected,
  roster,
  onCast,
  onViewLines,
  onMerged,
}: {
  bookId: string;
  detected: DetectedCharacter;
  roster: Character[];
  onCast: () => void;
  onViewLines: () => void;
  onMerged: () => void;
}) {
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [mergeSearch, setMergeSearch] = useState("");
  const [merging, setMerging] = useState(false);

  const mergeTargets = useMemo(
    () =>
      roster
        .filter(
          (c) =>
            c.id !== detected.matched_character_id &&
            c.canonical_name.toLowerCase() !== detected.name.toLowerCase() &&
            c.canonical_name.toLowerCase() !== "narrator"
        )
        .sort((a, b) =>
          a.canonical_name.localeCompare(b.canonical_name, undefined, {
            sensitivity: "base",
          })
        ),
    [roster, detected.matched_character_id, detected.name]
  );

  const filteredMergeTargets = useMemo(() => {
    const q = mergeSearch.trim().toLowerCase();
    if (!q) return mergeTargets;
    return mergeTargets.filter((c) =>
      characterMergeLabel(c).toLowerCase().includes(q)
    );
  }, [mergeTargets, mergeSearch]);

  const suggestedTargetId =
    detected.match_status === "possible_alias" && detected.matched_character_id
      ? detected.matched_character_id
      : mergeTargets[0]?.id ?? "";

  function openMergeDialog() {
    setMergeSearch("");
    setMergeTargetId(suggestedTargetId);
    setMergeOpen(true);
  }

  function closeMergeDialog() {
    setMergeOpen(false);
    setMergeSearch("");
  }

  async function confirmMerge() {
    if (!mergeTargetId) {
      toast.error("Choose a character to merge into");
      return;
    }
    const target = roster.find((c) => c.id === mergeTargetId);
    setMerging(true);
    try {
      const res = await fetch(`/api/books/${bookId}/merge-alias`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alias_name: detected.name,
          target_character_id: mergeTargetId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "Merge failed");
      }
      toast.success(
        `Merged "${detected.name}" into ${target?.canonical_name ?? "character"} — lines now use that speaker`
      );
      setMergeOpen(false);
      setMergeSearch("");
      onMerged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Merge failed");
    } finally {
      setMerging(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-7 shrink-0 whitespace-nowrap text-[11px] px-2 gap-1.5"
          >
            Actions
            <ChevronDown className="h-3 w-3 opacity-60 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={onCast}>
            {detected.match_status === "cast" ? "Edit voice" : "Cast voice"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onViewLines}>View lines</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={openMergeDialog}
            disabled={mergeTargets.length === 0}
          >
            Merge into another character…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={mergeOpen}
        onOpenChange={(o) => {
          if (!merging && !o) closeMergeDialog();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Merge &ldquo;{detected.name}&rdquo;</DialogTitle>
            <DialogDescription>
              All {detected.line_count.toLocaleString()} line
              {detected.line_count === 1 ? "" : "s"} for this name will be
              reassigned to the character you pick. &ldquo;{detected.name}&rdquo;
              becomes an alias on that character and disappears from this list.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div>
              <Label htmlFor={`merge-search-${detected.name}`}>
                Merge into character
              </Label>
              <div className="relative mt-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate" />
                <Input
                  id={`merge-search-${detected.name}`}
                  value={mergeSearch}
                  onChange={(e) => setMergeSearch(e.target.value)}
                  placeholder="Search characters…"
                  className="pl-8"
                  autoFocus
                />
              </div>
            </div>

            <div className="max-h-52 overflow-y-auto rounded-md border border-border-muted">
              {filteredMergeTargets.length === 0 ? (
                <p className="px-3 py-4 text-sm text-slate">
                  No characters match &ldquo;{mergeSearch.trim()}&rdquo;
                </p>
              ) : (
                filteredMergeTargets.map((c) => {
                  const selected = mergeTargetId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setMergeTargetId(c.id)}
                      className={cn(
                        "flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors",
                        selected
                          ? "bg-warm-sand border-l-[3px] border-l-teal"
                          : "hover:bg-warm-sand/50"
                      )}
                    >
                      <Check
                        className={cn(
                          "mt-0.5 h-4 w-4 shrink-0 text-teal",
                          selected ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="min-w-0 break-words">
                        {characterMergeLabel(c)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {mergeTargetId && (
              <p className="text-[11px] text-slate">
                Selected:{" "}
                <span className="text-ink">
                  {characterMergeLabel(
                    mergeTargets.find((c) => c.id === mergeTargetId) ??
                      roster.find((c) => c.id === mergeTargetId)!
                  )}
                </span>
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={closeMergeDialog}
                disabled={merging}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void confirmMerge()}
                disabled={merging || !mergeTargetId}
              >
                {merging ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Merging…
                  </>
                ) : (
                  "Merge lines"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
