import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllTaggedLines } from "@/lib/supabase/fetch-all";
import { updateBookStatus } from "@/lib/books/compute-book-status";
import { isSplitInsideQuote } from "@/lib/engine/quote-spans";

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

export async function splitTaggedLine(
  admin: SupabaseClient,
  bookId: string,
  lineId: string,
  start: number,
  end: number,
  selectionSpeaker: {
    speaker_label: string;
    speaker_character_id: string | null;
  }
): Promise<{ created: number; line_ids: string[] }> {
  const lines = await loadBookLines(admin, bookId);
  const index = lines.findIndex((l) => l.id === lineId);
  if (index < 0) throw new Error("Line not found");

  const line = lines[index]!;
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
    return { created: 1, line_ids: [lineId] };
  }

  const segments = sliceLineIntoSegments(
    text,
    start,
    end,
    {
      speaker_label: line.speaker_label,
      speaker_character_id: line.speaker_character_id,
    },
    selectionSpeaker
  );

  if (segments.length < 2) {
    throw new Error("Selection must split the line into at least two parts");
  }

  const { error: delError } = await admin
    .from("tagged_lines")
    .delete()
    .eq("id", lineId)
    .eq("book_id", bookId);
  if (delError) throw new Error(delError.message);

  const insertRows = segments.map((seg, i) => ({
    book_id: bookId,
    line_order: line.line_order + i,
    paragraph_num: line.paragraph_num,
    speaker_label: seg.speaker_label,
    speaker_character_id: seg.speaker_character_id,
    line_text: seg.line_text,
    confidence: line.confidence,
    flag_reason: i === 0 ? line.flag_reason : null,
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

  await renumberBookLines(admin, bookId);
  await recomputeBookCharacterCounts(admin, bookId);
  await updateBookStatus(admin, bookId);

  return {
    created: inserted?.length ?? segments.length,
    line_ids: (inserted ?? []).map((r) => r.id),
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
  await recomputeBookCharacterCounts(admin, bookId);
  await updateBookStatus(admin, bookId);

  return { merged_line_id: first.id };
}

export async function deleteTaggedLines(
  admin: SupabaseClient,
  bookId: string,
  lineIds: string[]
): Promise<{ deleted: number }> {
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
  await recomputeBookCharacterCounts(admin, bookId);
  await updateBookStatus(admin, bookId);

  return { deleted: lineIds.length };
}
