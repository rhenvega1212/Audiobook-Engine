import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllTaggedLines } from "@/lib/supabase/fetch-all";

export type ManuscriptSnapshotSource =
  | "manual"
  | "auto"
  | "after_import"
  | "pre_ai_review"
  | "pre_delete";

export type ManuscriptSnapshotLine = {
  id: string;
  line_order: number;
  paragraph_num: number;
  speaker_label: string;
  speaker_character_id: string | null;
  line_text: string;
  confidence: string | null;
  flag_reason: string | null;
  ai_reviewed: boolean;
  human_reviewed: boolean;
  excluded_from_export: boolean;
  spoken_text: string | null;
};

const SNAPSHOT_SELECT =
  "id, line_order, paragraph_num, speaker_label, speaker_character_id, line_text, confidence, flag_reason, ai_reviewed, human_reviewed, excluded_from_export, spoken_text";

const MAX_SNAPSHOTS = 8;
const AUTO_CHECKPOINT_MS = 2 * 60 * 1000;

export type ManuscriptSnapshotMeta = {
  id: string;
  label: string;
  source: ManuscriptSnapshotSource;
  line_count: number;
  created_at: string;
};

export async function createManuscriptSnapshot(
  admin: SupabaseClient,
  bookId: string,
  options?: {
    label?: string;
    source?: ManuscriptSnapshotSource;
  }
): Promise<ManuscriptSnapshotMeta | null> {
  let rows: ManuscriptSnapshotLine[];
  try {
    rows = await fetchAllTaggedLines(admin, bookId, SNAPSHOT_SELECT);
  } catch {
    return null;
  }

  if (rows.length === 0) return null;

  const label = options?.label ?? "Checkpoint";
  const source = options?.source ?? "manual";

  const { data, error } = await admin
    .from("book_manuscript_snapshots")
    .insert({
      book_id: bookId,
      label,
      source,
      line_count: rows.length,
      lines: rows,
    })
    .select("id, label, source, line_count, created_at")
    .single();

  if (error) {
    console.warn("Manuscript snapshot skipped:", error.message);
    return null;
  }

  await pruneOldSnapshots(admin, bookId);

  return data as ManuscriptSnapshotMeta;
}

/** Rolling checkpoint before manual edits — at most one every few minutes. */
export async function ensureEditCheckpoint(
  admin: SupabaseClient,
  bookId: string
): Promise<void> {
  const latest = await getLatestManuscriptSnapshot(admin, bookId);
  if (
    latest &&
    latest.source === "auto" &&
    Date.now() - new Date(latest.created_at).getTime() < AUTO_CHECKPOINT_MS
  ) {
    return;
  }

  await createManuscriptSnapshot(admin, bookId, {
    label: "Before manual edits",
    source: "auto",
  });
}

export async function listManuscriptSnapshots(
  admin: SupabaseClient,
  bookId: string,
  limit = MAX_SNAPSHOTS
): Promise<ManuscriptSnapshotMeta[]> {
  const { data, error } = await admin
    .from("book_manuscript_snapshots")
    .select("id, label, source, line_count, created_at")
    .eq("book_id", bookId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as ManuscriptSnapshotMeta[];
}

export async function getLatestManuscriptSnapshot(
  admin: SupabaseClient,
  bookId: string,
  source?: ManuscriptSnapshotSource
): Promise<ManuscriptSnapshotMeta | null> {
  let query = admin
    .from("book_manuscript_snapshots")
    .select("id, label, source, line_count, created_at")
    .eq("book_id", bookId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (source) {
    query = query.eq("source", source);
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return data as ManuscriptSnapshotMeta;
}

export async function restoreManuscriptSnapshot(
  admin: SupabaseClient,
  bookId: string,
  snapshotId?: string
): Promise<{ restored: number; snapshot: ManuscriptSnapshotMeta }> {
  type SnapRow = {
    id: string;
    label: string;
    source: string;
    line_count: number;
    created_at: string;
    lines: ManuscriptSnapshotLine[];
  };

  let snap: SnapRow;

  if (snapshotId) {
    const { data, error } = await admin
      .from("book_manuscript_snapshots")
      .select("id, label, source, line_count, created_at, lines")
      .eq("book_id", bookId)
      .eq("id", snapshotId)
      .maybeSingle();
    if (error || !data) {
      throw new Error("Restore point not found.");
    }
    snap = data as SnapRow;
  } else {
    const { data, error } = await admin
      .from("book_manuscript_snapshots")
      .select("id, label, source, line_count, created_at, lines")
      .eq("book_id", bookId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) {
      throw new Error("No restore point saved yet.");
    }
    snap = data as SnapRow;
  }

  const lines = snap.lines as ManuscriptSnapshotLine[];
  const BATCH = 25;
  let restored = 0;

  for (let i = 0; i < lines.length; i += BATCH) {
    const chunk = lines.slice(i, i + BATCH);
    await Promise.all(
      chunk.map(async (row) => {
        const { error: updErr } = await admin
          .from("tagged_lines")
          .update({
            line_order: row.line_order,
            paragraph_num: row.paragraph_num,
            speaker_label: row.speaker_label,
            speaker_character_id: row.speaker_character_id,
            line_text: row.line_text,
            confidence: row.confidence,
            flag_reason: row.flag_reason,
            ai_reviewed: row.ai_reviewed,
            human_reviewed: row.human_reviewed,
            excluded_from_export: row.excluded_from_export,
            spoken_text: row.spoken_text,
          })
          .eq("id", row.id)
          .eq("book_id", bookId);
        if (!updErr) restored++;
      })
    );
  }

  return {
    restored,
    snapshot: {
      id: snap.id,
      label: snap.label,
      source: snap.source as ManuscriptSnapshotSource,
      line_count: snap.line_count,
      created_at: snap.created_at,
    },
  };
}

async function pruneOldSnapshots(
  admin: SupabaseClient,
  bookId: string
): Promise<void> {
  const { data: old } = await admin
    .from("book_manuscript_snapshots")
    .select("id")
    .eq("book_id", bookId)
    .order("created_at", { ascending: false })
    .range(MAX_SNAPSHOTS, 50);

  if (old && old.length > 0) {
    await admin
      .from("book_manuscript_snapshots")
      .delete()
      .in(
        "id",
        old.map((r) => r.id)
      );
  }
}
