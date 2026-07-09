import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllTaggedLines } from "@/lib/supabase/fetch-all";
import {
  recomputeBookCharacterCounts,
  renumberBookLines,
} from "@/lib/books/line-operations";
import { resyncBookChapterPositions } from "@/lib/books/book-chapters";

export type ManuscriptSnapshotSource =
  | "manual"
  | "auto"
  | "after_import"
  | "pre_ai_review"
  | "pre_delete"
  | "undo";

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

const MAX_OTHER_SNAPSHOTS = 8;
const MAX_UNDO_SNAPSHOTS = 10;

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

  await pruneOtherSnapshots(admin, bookId);

  return data as ManuscriptSnapshotMeta;
}

/** Full character roster for a book's series, stored inside undo checkpoints. */
type SnapshotCharacter = Record<string, unknown> & { id: string };

async function fetchSeriesCharacters(
  admin: SupabaseClient,
  bookId: string
): Promise<SnapshotCharacter[] | null> {
  const { data: book } = await admin
    .from("books")
    .select("series_id")
    .eq("id", bookId)
    .maybeSingle();
  if (!book?.series_id) return null;

  const { data, error } = await admin
    .from("characters")
    .select("*")
    .eq("series_id", book.series_id);
  if (error || !data) return null;
  return data as SnapshotCharacter[];
}

/** Save state before each manual edit — keeps the last 10 undo points. */
export async function createUndoCheckpoint(
  admin: SupabaseClient,
  bookId: string,
  label = "Undo point",
  options?: { includeCharacters?: boolean }
): Promise<void> {
  let rows: ManuscriptSnapshotLine[];
  try {
    rows = await fetchAllTaggedLines(admin, bookId, SNAPSHOT_SELECT);
  } catch {
    return;
  }

  if (rows.length === 0) return;

  // Character-level operations (merge, delete) also need the roster captured so
  // undo can recreate deleted characters and revert voice/alias changes.
  const characters = options?.includeCharacters
    ? await fetchSeriesCharacters(admin, bookId)
    : null;

  const basePayload = {
    book_id: bookId,
    label,
    source: "undo",
    line_count: rows.length,
    lines: rows,
  };

  const { error } = await admin
    .from("book_manuscript_snapshots")
    // `characters` may not be in the generated types yet; cast to keep it at
    // runtime without a type error.
    .insert(
      (characters
        ? { ...basePayload, characters }
        : basePayload) as typeof basePayload
    );

  if (error) {
    // The characters column may not have been migrated yet — fall back to a
    // line-only checkpoint so undo still works for everything else.
    if (characters) {
      const { error: retryError } = await admin
        .from("book_manuscript_snapshots")
        .insert(basePayload);
      if (retryError) {
        console.warn("Undo checkpoint skipped:", retryError.message);
        return;
      }
    } else {
      console.warn("Undo checkpoint skipped:", error.message);
      return;
    }
  }

  await pruneUndoSnapshots(admin, bookId);
}

/** @deprecated Use createUndoCheckpoint — kept for any legacy callers. */
export async function ensureEditCheckpoint(
  admin: SupabaseClient,
  bookId: string
): Promise<void> {
  await createUndoCheckpoint(admin, bookId, "Before manual edits");
}

export async function listManuscriptSnapshots(
  admin: SupabaseClient,
  bookId: string,
  limit = MAX_OTHER_SNAPSHOTS
): Promise<ManuscriptSnapshotMeta[]> {
  const { data, error } = await admin
    .from("book_manuscript_snapshots")
    .select("id, label, source, line_count, created_at")
    .eq("book_id", bookId)
    .neq("source", "undo")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as ManuscriptSnapshotMeta[];
}

export async function countUndoSnapshots(
  admin: SupabaseClient,
  bookId: string
): Promise<number> {
  const { count, error } = await admin
    .from("book_manuscript_snapshots")
    .select("*", { count: "exact", head: true })
    .eq("book_id", bookId)
    .eq("source", "undo");

  if (error) return 0;
  return count ?? 0;
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
): Promise<{
  restored: number;
  inserted: number;
  deleted: number;
  snapshot: ManuscriptSnapshotMeta;
}> {
  return fullRestoreManuscriptSnapshot(admin, bookId, snapshotId);
}

export async function undoLastManuscriptEdit(
  admin: SupabaseClient,
  bookId: string
): Promise<{
  restored: number;
  inserted: number;
  deleted: number;
  snapshot: ManuscriptSnapshotMeta;
  undo_remaining: number;
}> {
  const latest = await getLatestManuscriptSnapshot(admin, bookId, "undo");
  if (!latest) {
    throw new Error("Nothing to undo.");
  }

  const result = await fullRestoreManuscriptSnapshot(admin, bookId, latest.id);

  await admin
    .from("book_manuscript_snapshots")
    .delete()
    .eq("id", latest.id)
    .eq("book_id", bookId);

  const undo_remaining = await countUndoSnapshots(admin, bookId);

  return { ...result, undo_remaining };
}

async function fullRestoreManuscriptSnapshot(
  admin: SupabaseClient,
  bookId: string,
  snapshotId?: string
): Promise<{
  restored: number;
  inserted: number;
  deleted: number;
  snapshot: ManuscriptSnapshotMeta;
}> {
  type SnapRow = {
    id: string;
    label: string;
    source: string;
    line_count: number;
    created_at: string;
    lines: ManuscriptSnapshotLine[];
    characters?: SnapshotCharacter[] | null;
  };

  // Prefer selecting the characters column, but fall back if it hasn't been
  // migrated yet so existing line-only restore keeps working.
  async function loadSnap(withCharacters: boolean) {
    const cols: string = withCharacters
      ? "id, label, source, line_count, created_at, lines, characters"
      : "id, label, source, line_count, created_at, lines";
    let query = admin
      .from("book_manuscript_snapshots")
      .select(cols)
      .eq("book_id", bookId);
    if (snapshotId) {
      query = query.eq("id", snapshotId);
    } else {
      query = query.order("created_at", { ascending: false }).limit(1);
    }
    return query.maybeSingle();
  }

  let { data, error } = await loadSnap(true);
  if (error) {
    ({ data, error } = await loadSnap(false));
  }
  if (error || !data) {
    throw new Error(
      snapshotId ? "Restore point not found." : "No restore point saved yet."
    );
  }
  const snap = data as unknown as SnapRow;

  // Recreate/revert characters first so restored lines can reference character
  // rows that a merge or delete removed. Upsert-only: we never delete newer
  // characters, we only bring back what the snapshot had and revert their fields.
  if (Array.isArray(snap.characters) && snap.characters.length > 0) {
    const { error: charErr } = await admin
      .from("characters")
      .upsert(snap.characters, { onConflict: "id" });
    if (charErr) throw new Error(charErr.message);
  }

  const lines = snap.lines as ManuscriptSnapshotLine[];
  const snapshotIdSet = new Set(lines.map((row) => row.id));

  const current = await fetchAllTaggedLines<{ id: string }>(admin, bookId, "id");
  const toDelete = current
    .filter((row) => !snapshotIdSet.has(row.id))
    .map((row) => row.id);

  let deleted = 0;
  const DELETE_CHUNK = 100;
  for (let i = 0; i < toDelete.length; i += DELETE_CHUNK) {
    const chunk = toDelete.slice(i, i + DELETE_CHUNK);
    const { error: delErr } = await admin
      .from("tagged_lines")
      .delete()
      .eq("book_id", bookId)
      .in("id", chunk);
    if (delErr) throw new Error(delErr.message);
    deleted += chunk.length;
  }

  const survivingIds = new Set(
    current.filter((row) => snapshotIdSet.has(row.id)).map((row) => row.id)
  );

  const BATCH = 25;
  let restored = 0;
  let inserted = 0;

  for (let i = 0; i < lines.length; i += BATCH) {
    const chunk = lines.slice(i, i + BATCH);
    await Promise.all(
      chunk.map(async (row) => {
        const payload = {
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
        };

        if (survivingIds.has(row.id)) {
          const { error: updErr } = await admin
            .from("tagged_lines")
            .update(payload)
            .eq("id", row.id)
            .eq("book_id", bookId);
          if (!updErr) restored++;
          return;
        }

        const { error: insErr } = await admin.from("tagged_lines").insert({
          id: row.id,
          book_id: bookId,
          ...payload,
        });
        if (!insErr) inserted++;
      })
    );
  }

  await renumberBookLines(admin, bookId);
  await resyncBookChapterPositions(admin, bookId);
  await recomputeBookCharacterCounts(admin, bookId);

  return {
    restored,
    inserted,
    deleted,
    snapshot: {
      id: snap.id,
      label: snap.label,
      source: snap.source as ManuscriptSnapshotSource,
      line_count: snap.line_count,
      created_at: snap.created_at,
    },
  };
}

async function pruneUndoSnapshots(
  admin: SupabaseClient,
  bookId: string
): Promise<void> {
  const { data: old } = await admin
    .from("book_manuscript_snapshots")
    .select("id")
    .eq("book_id", bookId)
    .eq("source", "undo")
    .order("created_at", { ascending: false })
    .range(MAX_UNDO_SNAPSHOTS, 50);

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

async function pruneOtherSnapshots(
  admin: SupabaseClient,
  bookId: string
): Promise<void> {
  const { data: old } = await admin
    .from("book_manuscript_snapshots")
    .select("id")
    .eq("book_id", bookId)
    .neq("source", "undo")
    .order("created_at", { ascending: false })
    .range(MAX_OTHER_SNAPSHOTS, 50);

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
