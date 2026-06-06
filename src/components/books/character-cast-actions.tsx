"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DetectedCharacter } from "@/lib/characters/match-status";
import type { Character } from "@/lib/types/database";

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
  const [merging, setMerging] = useState(false);

  const mergeTargets = useMemo(
    () =>
      roster.filter(
        (c) =>
          c.id !== detected.matched_character_id &&
          c.canonical_name.toLowerCase() !== detected.name.toLowerCase() &&
          c.canonical_name.toLowerCase() !== "narrator"
      ),
    [roster, detected.matched_character_id, detected.name]
  );

  const suggestedTargetId =
    detected.match_status === "possible_alias" && detected.matched_character_id
      ? detected.matched_character_id
      : mergeTargets[0]?.id ?? "";

  function openMergeDialog() {
    setMergeTargetId(suggestedTargetId);
    setMergeOpen(true);
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

      <Dialog open={mergeOpen} onOpenChange={(o) => !merging && setMergeOpen(o)}>
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
          <div className="space-y-4 pt-1">
            <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
              <SelectTrigger>
                <SelectValue placeholder="Merge into…" />
              </SelectTrigger>
              <SelectContent>
                {mergeTargets.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.canonical_name}
                    {c.elevenlabs_voice_name
                      ? ` · ${c.elevenlabs_voice_name}`
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setMergeOpen(false)}
                disabled={merging}
              >
                Cancel
              </Button>
              <Button onClick={() => void confirmMerge()} disabled={merging}>
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
