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
  onChanged,
}: {
  bookId: string;
  detected: DetectedCharacter;
  roster: Character[];
  onCast: () => void;
  onViewLines: () => void;
  onMerged: () => void;
  onChanged: () => void;
}) {
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [mergeSearch, setMergeSearch] = useState("");
  const [merging, setMerging] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const mergeTargets = useMemo(
    () =>
      roster
        .filter(
          (c) =>
            // Exclude only the detected name itself (can't merge into itself)
            // and the narrator. The matched/suggested character IS a valid
            // target — confirming a possible alias is the whole point.
            c.canonical_name.toLowerCase() !== detected.name.toLowerCase() &&
            c.canonical_name.toLowerCase() !== "narrator"
        )
        .sort((a, b) =>
          a.canonical_name.localeCompare(b.canonical_name, undefined, {
            sensitivity: "base",
          })
        ),
    [roster, detected.name]
  );

  const filteredMergeTargets = useMemo(() => {
    const q = mergeSearch.trim().toLowerCase();
    if (!q) return mergeTargets;
    // Match on the character's name and aliases — not the voice name — so
    // searching a person's name finds that character, not characters that
    // happen to use a voice with a similar name.
    return mergeTargets.filter((c) => {
      if (c.canonical_name.toLowerCase().includes(q)) return true;
      return (c.aliases ?? []).some((a) => a.toLowerCase().includes(q));
    });
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

  function openRenameDialog() {
    setRenameValue(detected.name);
    setRenameOpen(true);
  }

  function closeRenameDialog() {
    setRenameOpen(false);
    setRenameValue("");
  }

  async function confirmRename() {
    const newName = renameValue.trim();
    if (!newName) {
      toast.error("Enter a name");
      return;
    }
    if (newName.toLowerCase() === detected.name.toLowerCase()) {
      toast.error("Enter a different name");
      return;
    }
    setRenaming(true);
    try {
      const res = await fetch(`/api/books/${bookId}/speakers/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          speaker_label: detected.name,
          new_name: newName,
          character_id: detected.matched_character_id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "Rename failed");
      }
      const updated = (data as { lines_updated?: number }).lines_updated ?? 0;
      toast.success(
        `Renamed to "${newName}" — ${updated.toLocaleString()} line${updated === 1 ? "" : "s"} updated`
      );
      closeRenameDialog();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rename failed");
    } finally {
      setRenaming(false);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/books/${bookId}/speakers/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          speaker_label: detected.name,
          character_id: detected.matched_character_id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "Delete failed");
      }
      const reassigned =
        (data as { reassigned_lines?: number }).reassigned_lines ?? 0;
      toast.success(
        `Removed "${detected.name}" — ${reassigned.toLocaleString()} line${reassigned === 1 ? "" : "s"} set to UNKNOWN`
      );
      setDeleteOpen(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
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
          <DropdownMenuItem onClick={openRenameDialog}>
            Rename character…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setDeleteOpen(true)}
            className="text-burgundy focus:text-burgundy"
          >
            Delete character…
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

      <Dialog
        open={renameOpen}
        onOpenChange={(o) => {
          if (!renaming && !o) closeRenameDialog();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rename &ldquo;{detected.name}&rdquo;</DialogTitle>
            <DialogDescription>
              All {detected.line_count.toLocaleString()} line
              {detected.line_count === 1 ? "" : "s"} for this character will
              use the new name.
              {detected.matched_character_id
                ? " The series character record is updated too."
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div>
              <Label htmlFor={`rename-${detected.name}`}>New name</Label>
              <Input
                id={`rename-${detected.name}`}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="mt-1"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void confirmRename();
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={closeRenameDialog}
                disabled={renaming}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void confirmRename()}
                disabled={renaming || !renameValue.trim()}
              >
                {renaming ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Renaming…
                  </>
                ) : (
                  "Rename"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onOpenChange={(o) => {
          if (!deleting && !o) setDeleteOpen(false);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{detected.name}&rdquo;?</DialogTitle>
            <DialogDescription>
              {detected.line_count.toLocaleString()} line
              {detected.line_count === 1 ? "" : "s"} will be set to UNKNOWN so
              you can re-assign them.
              {detected.matched_character_id
                ? " The character is removed from the series cast."
                : " This only affects lines on this book."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmDelete()}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete character"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
