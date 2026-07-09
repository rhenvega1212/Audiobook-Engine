import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllTaggedLines } from "@/lib/supabase/fetch-all";
import { updateBookStatus } from "@/lib/books/compute-book-status";
import { resyncBookChapterPositions, type BookChapterRow } from "@/lib/books/book-chapters";
import { isSplitInsideQuote, trailingTextStartsDialogue } from "@/lib/engine/quote-spans";

export type LineSegment = {
  line_text: string;
  speaker_label: string;
  speaker_character_id: string | null;
};

type DbLine = {
  id: string;
  line_order: number;
  paragraph_num: number;
  line_text: string;
  speaker_label: string;
  speaker_character_id: string | null;
  confidence: string | null;
  flag_reason: string | null;
  ai_reviewed: boolean;
  human_reviewed: boolean;
  excluded_from_export?: boolean;
  spoken_text?: string | null;
};

export function sliceLineIntoSegments(
  text: string,
  start: number,
  end: number,
  original: { speaker_label: string; speaker_character_id: string | null },
  selection: { speaker_label: string; speaker_character_id: string | null }
): LineSegment[] {
  const a = text.slice(0, start);
  const b = text.slice(start, end);
  const c = text.slice(end);
  const segments: LineSegment[] = [];

  if (a.length > 0) {
    segments.push({
      line_text: a,
      speaker_label: original.speaker_label,
      speaker_character_id: original.speaker_character_id,
    });
  }
  if (b.length > 0) {
    segments.push({
      line_text: b,
      speaker_label: selection.speaker_label,
      speaker_character_id: selection.speaker_character_id,
    });
  }
  if (c.length > 0) {
    segments.push({
      line_text: c,
      speaker_label: original.speaker_label,
      speaker_character_id: original.speaker_character_id,
    });
  }

  return segments;
}

export async function renumberBookLines(
  admin: SupabaseClient,
  bookId: string
): Promise<void> {
  const { error: rpcError } = await admin.rpc("renumber_tagged_lines", {
    p_book_id: bookId,
  });

  if (!rpcError) return;

  const rpcMsg = rpcError.message?.toLowerCase() ?? "";
  const rpcMissing =
    rpcMsg.includes("does not exist") ||
    rpcMsg.includes("could not find") ||
    rpcMsg.includes("schema cache");

  if (!rpcMissing) {
    throw new Error(rpcError.message);
  }

  // Fallback if migration not applied yet
  const lines = await fetchAllTaggedLines<Pick<DbLine, "id" | "line_order">>(
    admin,
    bookId,
    "id, line_order"
  );

  const updates: { id: string; line_order: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.line_order !== i) {
      updates.push({ id: lines[i]!.id, line_order: i });
    }
  }

  const chunkSize = 100;
  for (let c = 0; c < updates.length; c += chunkSize) {
    const chunk = updates.slice(c, c + chunkSize);
    const results = await Promise.all(
      chunk.map((u) =>
        admin
          .from("tagged_lines")
          .update({ line_order: u.line_order })
          .eq("id", u.id)
      )
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);
  }
}

export async function recomputeBookCharacterCounts(
  admin: SupabaseClient,
  bookId: string
): Promise<void> {
  const lines = await fetchAllTaggedLines<{
    speaker_character_id: string | null;
  }>(admin, bookId, "speaker_character_id");

  const counts = new Map<string, number>();
  for (const line of lines) {
    if (!line.speaker_character_id) continue;
    counts.set(
      line.speaker_character_id,
      (counts.get(line.speaker_character_id) ?? 0) + 1
    );
  }

  await admin.from("book_characters").delete().eq("book_id", bookId);

  const rows = [...counts.entries()].map(([character_id, line_count]) => ({
    book_id: bookId,
    character_id,
    line_count,
  }));

  if (rows.length > 0) {
    const { error } = await admin.from("book_characters").insert(rows);
    if (error) throw new Error(error.message);
  }
}

async function loadBookLines(admin: SupabaseClient, bookId: string) {
  try {
    return await fetchAllTaggedLines<DbLine>(
      admin,
      bookId,
      "id, line_order, paragraph_num, line_text, speaker_label, speaker_character_id, confidence, flag_reason, ai_reviewed, human_reviewed, excluded_from_export, spoken_text"
    );
  } catch {
    return await fetchAllTaggedLines<DbLine>(
      admin,
      bookId,
      "id, line_order, paragraph_num, line_text, speaker_label, speaker_character_id, confidence, flag_reason, ai_reviewed, human_reviewed, spoken_text"
    );
  }
}

const LINE_SELECT =
  "id, line_order, paragraph_num, line_text, speaker_label, speaker_character_id, confidence, flag_reason, ai_reviewed, human_reviewed, excluded_from_export, spoken_text";

async function shiftLineOrdersAfter(
  admin: SupabaseClient,
  bookId: string,
  afterOrder: number,
  delta: number
): Promise<void> {
  if (delta <= 0) return;

  const { error: rpcError } = await admin.rpc("shift_tagged_line_orders", {
    p_book_id: bookId,
    p_after_order: afterOrder,
    p_delta: delta,
  });

  if (!rpcError) return;

  const rpcMsg = rpcError.message?.toLowerCase() ?? "";
  const rpcMissing =
    rpcMsg.includes("does not exist") ||
    rpcMsg.includes("could not find") ||
    rpcMsg.includes("schema cache");

  if (!rpcMissing) throw new Error(rpcError.message);

  // Fallback when shift RPC not deployed: bump in parallel chunks
  const following = await fetchAllTaggedLines<Pick<DbLine, "id" | "line_order">>(
    admin,
    bookId,
    "id, line_order"
  );
  const toShift = following
    .filter((row) => row.line_order > afterOrder)
    .sort((a, b) => b.line_order - a.line_order);

  const chunkSize = 50;
  for (let i = 0; i < toShift.length; i += chunkSize) {
    const chunk = toShift.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map((row) =>
        admin
          .from("tagged_lines")
          .update({ line_order: row.line_order + delta })
          .eq("id", row.id)
          .eq("book_id", bookId)
      )
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);
  }
}

async function loadSplitContext(
  admin: SupabaseClient,
  bookId: string,
  lineId: string
): Promise<{ line: DbLine; nextLine: DbLine | null }> {
  let lineQuery = await admin
    .from("tagged_lines")
    .select(LINE_SELECT)
    .eq("id", lineId)
    .eq("book_id", bookId)
    .maybeSingle();

  if (lineQuery.error?.message.includes("excluded_from_export")) {
    lineQuery = await admin
      .from("tagged_lines")
      .select(
        "id, line_order, paragraph_num, line_text, speaker_label, speaker_character_id, confidence, flag_reason, ai_reviewed, human_reviewed, spoken_text"
      )
      .eq("id", lineId)
      .eq("book_id", bookId)
      .maybeSingle();
  }

  if (lineQuery.error || !lineQuery.data) {
    throw new Error("Line not found");
  }

  const line = lineQuery.data as DbLine;

  let nextQuery = await admin
    .from("tagged_lines")
    .select(LINE_SELECT)
    .eq("book_id", bookId)
    .gt("line_order", line.line_order)
    .order("line_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (nextQuery.error?.message.includes("excluded_from_export")) {
    nextQuery = await admin
      .from("tagged_lines")
      .select(
        "id, line_order, paragraph_num, line_text, speaker_label, speaker_character_id, confidence, flag_reason, ai_reviewed, human_reviewed, spoken_text"
      )
      .eq("book_id", bookId)
      .gt("line_order", line.line_order)
      .order("line_order", { ascending: true })
      .limit(1)
      .maybeSingle();
  }

  return {
    line,
    nextLine: (nextQuery.data as DbLine | null) ?? null,
  };
}

export type SplitLineRow = Pick<
  DbLine,
  | "id"
  | "line_order"
  | "paragraph_num"
  | "line_text"
  | "speaker_label"
  | "speaker_character_id"
  | "flag_reason"
  | "human_reviewed"
  | "excluded_from_export"
>;

export type SplitTaggedLineResult = {
  created: number;
  line_ids: string[];
  lines: SplitLineRow[];
  /** How many new rows were inserted (0 when merging into next line). */
  inserted_count: number;
  split_at_order: number;
};

export type SplitTaggedLineOptions = {
  merge_trailing_into_next?: boolean;
  trailing_speaker?: {
    speaker_label: string;
    speaker_character_id: string | null;
  };
};

export async function splitTaggedLine(
  admin: SupabaseClient,
  bookId: string,
  lineId: string,
  start: number,
  end: number,
  selectionSpeaker: {
    speaker_label: string;
    speaker_character_id: string | null;
  },
  options?: SplitTaggedLineOptions
): Promise<SplitTaggedLineResult> {
  const { line, nextLine } = await loadSplitContext(admin, bookId, lineId);
  const text = line.line_text;
  if (start < 0 || end > text.length || start >= end) {
    throw new Error("Invalid selection range");
  }

  if (isSplitInsideQuote(text, start, end)) {
    throw new Error(
      "Cannot split inside quoted dialogue. Select text outside quotes or the full spoken line."
    );
  }

  if (start === 0 && end === text.length) {
    const { error } = await admin
      .from("tagged_lines")
      .update({
        speaker_label: selectionSpeaker.speaker_label,
        speaker_character_id: selectionSpeaker.speaker_character_id,
        human_reviewed: true,
      })
      .eq("id", lineId)
      .eq("book_id", bookId);
    if (error) throw new Error(error.message);
    await recomputeBookCharacterCounts(admin, bookId);
    await updateBookStatus(admin, bookId);
    const row: SplitLineRow = {
      id: lineId,
      line_order: line.line_order,
      paragraph_num: line.paragraph_num,
      line_text: line.line_text,
      speaker_label: selectionSpeaker.speaker_label,
      speaker_character_id: selectionSpeaker.speaker_character_id,
      flag_reason: line.flag_reason,
      human_reviewed: true,
      excluded_from_export: line.excluded_from_export ?? false,
    };
    return {
      created: 1,
      line_ids: [lineId],
      lines: [row],
      inserted_count: 0,
      split_at_order: line.line_order,
    };
  }

  let segments = sliceLineIntoSegments(
    text,
    start,
    end,
    {
      speaker_label: line.speaker_label,
      speaker_character_id: line.speaker_character_id,
    },
    selectionSpeaker
  );

  const trailingText = text.slice(end);
  const shouldMergeTrailing =
    options?.merge_trailing_into_next === true &&
    nextLine &&
    trailingText.trim().length > 0 &&
    trailingTextStartsDialogue(text, end);

  if (shouldMergeTrailing) {
    const last = segments[segments.length - 1];
    if (last && last.line_text === trailingText) {
      segments = segments.slice(0, -1);
    }
  }

  if (segments.length < 1) {
    throw new Error("Selection must split the line into at least two parts");
  }
  if (segments.length < 2 && !shouldMergeTrailing) {
    throw new Error("Selection must split the line into at least two parts");
  }

  const insertCount = segments.length - 1;
  await shiftLineOrdersAfter(admin, bookId, line.line_order, insertCount);

  const first = segments[0]!;
  const { error: updError } = await admin
    .from("tagged_lines")
    .update({
      line_text: first.line_text,
      speaker_label: first.speaker_label,
      speaker_character_id: first.speaker_character_id,
      human_reviewed: true,
      flag_reason: line.flag_reason,
      spoken_text: null,
    })
    .eq("id", lineId)
    .eq("book_id", bookId);
  if (updError) throw new Error(updError.message);

  const lineIds: string[] = [lineId];

  if (insertCount > 0) {
    const insertRows = segments.slice(1).map((seg, i) => ({
      book_id: bookId,
      line_order: line.line_order + 1 + i,
      paragraph_num: line.paragraph_num,
      speaker_label: seg.speaker_label,
      speaker_character_id: seg.speaker_character_id,
      line_text: seg.line_text,
      confidence: line.confidence,
      flag_reason: null,
      ai_reviewed: line.ai_reviewed,
      human_reviewed: true,
      excluded_from_export: line.excluded_from_export ?? false,
      spoken_text: null,
    }));

    const { data: inserted, error: insError } = await admin
      .from("tagged_lines")
      .insert(insertRows)
      .select("id");
    if (insError) throw new Error(insError.message);
    lineIds.push(...(inserted ?? []).map((r) => r.id));
  }

  if (shouldMergeTrailing && nextLine) {
    const joiner =
      trailingText.trim() && nextLine.line_text.trim() ? " " : "";
    const mergedText = trailingText + joiner + nextLine.line_text;
    const trailingSpeaker = options?.trailing_speaker;
    const { error: mergeError } = await admin
      .from("tagged_lines")
      .update({
        line_text: mergedText,
        ...(trailingSpeaker
          ? {
              speaker_label: trailingSpeaker.speaker_label,
              speaker_character_id: trailingSpeaker.speaker_character_id,
              human_reviewed: true,
            }
          : {}),
        spoken_text: null,
      })
      .eq("id", nextLine.id)
      .eq("book_id", bookId);
    if (mergeError) throw new Error(mergeError.message);
    if (!lineIds.includes(nextLine.id)) {
      lineIds.push(nextLine.id);
    }
  }

  await renumberBookLines(admin, bookId);
  await recomputeBookCharacterCounts(admin, bookId);
  await updateBookStatus(admin, bookId);

  const { data: resultRows, error: fetchErr } = await admin
    .from("tagged_lines")
    .select(
      "id, line_order, paragraph_num, line_text, speaker_label, speaker_character_id, flag_reason, human_reviewed, excluded_from_export"
    )
    .eq("book_id", bookId)
    .in("id", lineIds)
    .order("line_order", { ascending: true });

  if (fetchErr) throw new Error(fetchErr.message);

  return {
    created: lineIds.length,
    line_ids: lineIds,
    lines: (resultRows ?? []) as SplitLineRow[],
    inserted_count: insertCount,
    split_at_order: line.line_order,
  };
}

/** Move one line to a new position and renumber affected rows. */
export async function moveTaggedLine(
  admin: SupabaseClient,
  bookId: string,
  lineId: string,
  targetLineOrder: number
): Promise<{
  updated: number;
  line_orders: { id: string; line_order: number }[];
}> {
  const lines = await loadBookLines(admin, bookId);
  const sorted = [...lines].sort((a, b) => a.line_order - b.line_order);
  const fromIdx = sorted.findIndex((l) => l.id === lineId);
  if (fromIdx < 0) throw new Error("Line not found");

  const targetIdx = Math.max(0, Math.min(targetLineOrder, sorted.length - 1));
  if (fromIdx === targetIdx) {
    return {
      updated: 0,
      line_orders: sorted.map((l) => ({ id: l.id, line_order: l.line_order })),
    };
  }

  const [moved] = sorted.splice(fromIdx, 1);
  sorted.splice(targetIdx, 0, moved!);

  const updates: { id: string; line_order: number }[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i]!;
    if (row.line_order !== i) {
      updates.push({ id: row.id, line_order: i });
    }
  }

  const chunkSize = 50;
  for (let c = 0; c < updates.length; c += chunkSize) {
    const chunk = updates.slice(c, c + chunkSize);
    const results = await Promise.all(
      chunk.map((u) =>
        admin
          .from("tagged_lines")
          .update({ line_order: u.line_order })
          .eq("id", u.id)
          .eq("book_id", bookId)
      )
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);
  }

  // A pure reorder changes only line positions. Renumbering and chapter-start
  // resync are required, but character counts and book status depend on speakers
  // / flags / casting — none of which change here — so we skip that extra work.
  await renumberBookLines(admin, bookId);
  await resyncBookChapterPositions(admin, bookId);

  return {
    updated: updates.length,
    line_orders: sorted.map((l, i) => ({ id: l.id, line_order: i })),
  };
}

export async function mergeTaggedLines(
  admin: SupabaseClient,
  bookId: string,
  lineIds: string[]
): Promise<{ merged_line_id: string }> {
  if (lineIds.length < 2) {
    throw new Error("Select at least two lines to merge");
  }

  const lines = await loadBookLines(admin, bookId);
  const selected = lineIds
    .map((id) => lines.find((l) => l.id === id))
    .filter((l): l is DbLine => !!l)
    .sort((a, b) => a.line_order - b.line_order);

  if (selected.length !== lineIds.length) {
    throw new Error("One or more lines not found");
  }

  for (let i = 1; i < selected.length; i++) {
    if (selected[i]!.line_order !== selected[i - 1]!.line_order + 1) {
      throw new Error("Lines must be adjacent in the manuscript to merge");
    }
  }

  const first = selected[0]!;
  const mergedText = selected
    .map((l) => l.line_text.trim())
    .filter(Boolean)
    .join(" ");

  const { error: updError } = await admin
    .from("tagged_lines")
    .update({
      line_text: mergedText,
      human_reviewed: true,
      flag_reason: selected.some((l) => l.flag_reason) ? first.flag_reason : null,
    })
    .eq("id", first.id)
    .eq("book_id", bookId);
  if (updError) throw new Error(updError.message);

  const toDelete = selected.slice(1).map((l) => l.id);
  const { error: delError } = await admin
    .from("tagged_lines")
    .delete()
    .eq("book_id", bookId)
    .in("id", toDelete);
  if (delError) throw new Error(delError.message);

  await renumberBookLines(admin, bookId);
  await resyncBookChapterPositions(admin, bookId);
  await recomputeBookCharacterCounts(admin, bookId);
  await updateBookStatus(admin, bookId);

  return { merged_line_id: first.id };
}

/**
 * Replace the text of a document paragraph (a run of lines sharing a
 * `paragraph_num`) with freely-edited text, keeping the paragraph as a single
 * line under the first line's speaker.
 *
 * This powers the "writing doc" editing surface in the Manuscript editor: the
 * user retypes/rewrites a paragraph and we sync it back to `tagged_lines`. The
 * first line is kept (preserving its speaker + character link) and its text is
 * replaced; any additional lines in the paragraph are removed. When the edited
 * text is empty, the whole paragraph is deleted. A stale `spoken_text` override
 * is cleared because the source text changed.
 */
export async function editParagraphLines(
  admin: SupabaseClient,
  bookId: string,
  lineIds: string[],
  text: string
): Promise<{
  kept_line_id: string | null;
  deleted_line_ids: string[];
  line_text: string;
  chapters: BookChapterRow[];
}> {
  if (lineIds.length === 0) throw new Error("No paragraph selected");

  const lines = await loadBookLines(admin, bookId);
  const selected = lineIds
    .map((id) => lines.find((l) => l.id === id))
    .filter((l): l is DbLine => !!l)
    .sort((a, b) => a.line_order - b.line_order);

  if (selected.length === 0) throw new Error("Paragraph lines not found");

  const trimmed = text.trim();
  const first = selected[0]!;

  // Empty edit means "remove this paragraph" — delete every line in it.
  if (!trimmed) {
    const result = await deleteTaggedLines(
      admin,
      bookId,
      selected.map((l) => l.id)
    );
    return {
      kept_line_id: null,
      deleted_line_ids: selected.map((l) => l.id),
      line_text: "",
      chapters: result.chapters,
    };
  }

  const { error: updError } = await admin
    .from("tagged_lines")
    .update({
      line_text: trimmed,
      human_reviewed: true,
      spoken_text: null,
      flag_reason: null,
    })
    .eq("id", first.id)
    .eq("book_id", bookId);
  if (updError) throw new Error(updError.message);

  const toDelete = selected.slice(1).map((l) => l.id);
  if (toDelete.length > 0) {
    const { error: delError } = await admin
      .from("tagged_lines")
      .delete()
      .eq("book_id", bookId)
      .in("id", toDelete);
    if (delError) throw new Error(delError.message);
  }

  await renumberBookLines(admin, bookId);
  const chapters = await resyncBookChapterPositions(admin, bookId);
  await recomputeBookCharacterCounts(admin, bookId);
  await updateBookStatus(admin, bookId);

  return {
    kept_line_id: first.id,
    deleted_line_ids: toDelete,
    line_text: trimmed,
    chapters,
  };
}

export async function deleteTaggedLines(
  admin: SupabaseClient,
  bookId: string,
  lineIds: string[]
): Promise<{ deleted: number; chapters: BookChapterRow[] }> {
  if (lineIds.length === 0) throw new Error("No lines selected");

  const { error } = await admin
    .from("tagged_lines")
    .delete()
    .eq("book_id", bookId)
    .in("id", lineIds);
  if (error) throw new Error(error.message);

  const { error: chDelError } = await admin
    .from("book_chapters")
    .delete()
    .eq("book_id", bookId)
    .in("start_line_id", lineIds);
  if (
    chDelError &&
    !chDelError.message.includes("does not exist") &&
    !chDelError.message.includes("schema cache")
  ) {
    throw new Error(chDelError.message);
  }

  await admin
    .from("book_chapters")
    .delete()
    .eq("book_id", bookId)
    .is("start_line_id", null);

  await renumberBookLines(admin, bookId);
  const chapters = await resyncBookChapterPositions(admin, bookId);
  await recomputeBookCharacterCounts(admin, bookId);
  await updateBookStatus(admin, bookId);

  return { deleted: lineIds.length, chapters };
}
