import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllTaggedLines } from "@/lib/supabase/fetch-all";

export type AiReviewSnapshotLine = {
  id: string;
  speaker_label: string;
  speaker_character_id: string | null;
  confidence: string | null;
  flag_reason: string | null;
  ai_reviewed: boolean;
  human_reviewed: boolean;
};

const SNAPSHOT_SELECT =
  "id, speaker_label, speaker_character_id, confidence, flag_reason, ai_reviewed, human_reviewed";

/** Save current speaker assignments so the user can undo one AI review run. */
export async function createAiReviewSnapshot(
  admin: SupabaseClient,
  bookId: string
): Promise<{ id: string; line_count: number } | null> {
  let rows: AiReviewSnapshotLine[];
  try {
    rows = await fetchAllTaggedLines(admin, bookId, SNAPSHOT_SELECT);
  } catch {
    return null;
  }

  if (rows.length === 0) return null;

  const { data, error } = await admin
    .from("ai_review_snapshots")
    .insert({
      book_id: bookId,
      line_count: rows.length,
      lines: rows,
    })
    .select("id, line_count")
    .single();

  if (error) {
    console.warn("AI review snapshot skipped:", error.message);
    return null;
  }

  // Keep only the two most recent snapshots per book.
  const { data: old } = await admin
    .from("ai_review_snapshots")
    .select("id")
    .eq("book_id", bookId)
    .order("created_at", { ascending: false })
    .range(2, 50);

  if (old && old.length > 0) {
    await admin
      .from("ai_review_snapshots")
      .delete()
      .in(
        "id",
        old.map((r) => r.id)
      );
  }

  return data as { id: string; line_count: number };
}

export async function getLatestAiReviewSnapshot(
  admin: SupabaseClient,
  bookId: string
): Promise<{ id: string; created_at: string; line_count: number } | null> {
  const { data, error } = await admin
    .from("ai_review_snapshots")
    .select("id, created_at, line_count")
    .eq("book_id", bookId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

/** Restore speaker fields from the latest snapshot (does not touch line text or deletions). */
export async function restoreLatestAiReviewSnapshot(
  admin: SupabaseClient,
  bookId: string
): Promise<{ restored: number }> {
  const { data: snap, error } = await admin
    .from("ai_review_snapshots")
    .select("id, lines")
    .eq("book_id", bookId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !snap) {
    throw new Error("No AI review snapshot to restore.");
  }

  const lines = snap.lines as AiReviewSnapshotLine[];
  const BATCH = 25;
  let restored = 0;

  for (let i = 0; i < lines.length; i += BATCH) {
    const chunk = lines.slice(i, i + BATCH);
    await Promise.all(
      chunk.map(async (row) => {
        const { error: updErr } = await admin
          .from("tagged_lines")
          .update({
            speaker_label: row.speaker_label,
            speaker_character_id: row.speaker_character_id,
            confidence: row.confidence,
            flag_reason: row.flag_reason,
            ai_reviewed: row.ai_reviewed,
            human_reviewed: row.human_reviewed,
          })
          .eq("id", row.id)
          .eq("book_id", bookId);
        if (!updErr) restored++;
      })
    );
  }

  await admin.from("ai_review_snapshots").delete().eq("id", snap.id);

  return { restored };
}
