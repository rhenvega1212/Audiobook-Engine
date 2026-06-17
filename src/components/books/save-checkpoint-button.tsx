"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Bookmark } from "lucide-react";
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
import { saveBookCheckpoint } from "@/lib/books/save-checkpoint-client";

export function SaveCheckpointButton({
  bookId,
  defaultLabel,
  variant = "outline",
  size = "sm",
  className,
}: {
  bookId: string;
  defaultLabel: string;
  variant?: "default" | "secondary" | "outline" | "ghost";
  size?: "sm" | "default";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(defaultLabel);
  const [busy, setBusy] = useState(false);

  function openDialog() {
    setLabel(defaultLabel);
    setOpen(true);
  }

  async function handleSave() {
    setBusy(true);
    try {
      const snap = await saveBookCheckpoint(bookId, label);
      toast.success(
        `Saved “${snap.label}” (${snap.line_count.toLocaleString()} lines)`
      );
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={openDialog}
      >
        <Bookmark className="h-4 w-4 mr-1.5" />
        Save section
      </Button>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save restore point</DialogTitle>
            <DialogDescription>
              Saves speakers, flags, and line text so you can restore this section
              later from the book page.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="checkpoint-label">Section name</Label>
            <Input
              id="checkpoint-label"
              className="mt-1"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Chapter 4 — speakers done"
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSave();
              }}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy || !label.trim()} onClick={() => void handleSave()}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
