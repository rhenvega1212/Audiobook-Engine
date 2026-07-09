"use client";

import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function UndoEditButton({
  undoCount,
  busy,
  onUndo,
  size = "sm",
}: {
  undoCount: number;
  busy?: boolean;
  onUndo: () => void;
  size?: "sm" | "default";
}) {
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.platform);
  const shortcut = isMac ? "⌘Z" : "Ctrl+Z";

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      disabled={undoCount <= 0 || busy}
      title={`Undo (${shortcut})`}
      onClick={onUndo}
    >
      <Undo2 className="h-3.5 w-3.5 mr-1.5" />
      {busy ? "Undoing…" : `Undo${undoCount > 0 ? ` (${undoCount})` : ""}`}
    </Button>
  );
}
