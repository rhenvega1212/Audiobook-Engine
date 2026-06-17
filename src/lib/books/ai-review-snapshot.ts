import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createManuscriptSnapshot,
  getLatestManuscriptSnapshot,
  restoreManuscriptSnapshot,
  type ManuscriptSnapshotLine,
} from "./manuscript-snapshot";

export type AiReviewSnapshotLine = ManuscriptSnapshotLine;

/** @deprecated Use ManuscriptSnapshotLine */
export { type ManuscriptSnapshotLine as SnapshotLine };

/** Save current manuscript state before an AI review run (for undo). */
export async function createAiReviewSnapshot(
  admin: SupabaseClient,
  bookId: string
): Promise<{ id: string; line_count: number } | null> {
  const snap = await createManuscriptSnapshot(admin, bookId, {
    label: "Before AI review",
    source: "pre_ai_review",
  });
  if (!snap) return null;
  return { id: snap.id, line_count: snap.line_count };
}

export async function getLatestAiReviewSnapshot(
  admin: SupabaseClient,
  bookId: string
): Promise<{ id: string; created_at: string; line_count: number } | null> {
  const snap = await getLatestManuscriptSnapshot(admin, bookId, "pre_ai_review");
  if (!snap) return null;
  return {
    id: snap.id,
    created_at: snap.created_at,
    line_count: snap.line_count,
  };
}

/** Restore from the latest pre-AI-review checkpoint. */
export async function restoreLatestAiReviewSnapshot(
  admin: SupabaseClient,
  bookId: string
): Promise<{ restored: number }> {
  const latest = await getLatestManuscriptSnapshot(admin, bookId, "pre_ai_review");
  if (!latest) {
    throw new Error("No AI review snapshot to restore.");
  }
  const { restored } = await restoreManuscriptSnapshot(admin, bookId, latest.id);
  return { restored };
}
