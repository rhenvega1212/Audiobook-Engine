"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function useManuscriptUndo(bookId: string, initialUndoCount = 0) {
  const router = useRouter();
  const [undoCount, setUndoCount] = useState(initialUndoCount);
  const [undoBusy, setUndoBusy] = useState(false);

  useEffect(() => {
    setUndoCount(initialUndoCount);
  }, [initialUndoCount]);

  const refreshUndoCount = useCallback(async () => {
    try {
      const res = await fetch(`/api/books/${bookId}/snapshots`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setUndoCount((data as { undo_count?: number }).undo_count ?? 0);
      }
    } catch {
      // ignore
    }
  }, [bookId]);

  const applyUndo = useCallback(async () => {
    if (undoBusy || undoCount <= 0) return false;
    setUndoBusy(true);
    try {
      const res = await fetch(`/api/books/${bookId}/snapshots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "undo" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "Undo failed");
      }
      const remaining = (data as { undo_remaining?: number }).undo_remaining ?? 0;
      setUndoCount(remaining);
      const more =
        remaining > 0
          ? ` (${remaining} more undo${remaining === 1 ? "" : "s"} available)`
          : "";
      toast.success(`Undid last change${more}`);
      router.refresh();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Undo failed");
      return false;
    } finally {
      setUndoBusy(false);
    }
  }, [bookId, undoBusy, undoCount, router]);

  return {
    undoCount,
    undoBusy,
    applyUndo,
    refreshUndoCount,
    canUndo: undoCount > 0,
  };
}
