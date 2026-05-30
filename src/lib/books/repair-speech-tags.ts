import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { findCharacterBySpeaker } from "@/lib/characters/resolve-character";
import { fetchSourceParagraphs } from "@/lib/books/manuscript-source";
import { fetchAllTaggedLines } from "@/lib/supabase/fetch-all";
import { findMissingSpeechTagInserts } from "@/lib/manuscript/attribution-tags";
import { updateBookStatus } from "@/lib/books/compute-book-status";
import type { Character } from "@/lib/types/database";

/** Insert speech tags from the Word file that import previously dropped. */
export async function repairSpeechTagsInBook(
  admin: ReturnType<typeof createAdminClient>,
  bookId: string
) {
  const sourceParagraphs = await fetchSourceParagraphs(admin, bookId);
  if (!sourceParagraphs?.length) {
    return {
      inserted: 0,
      error: "Original Word file not found — upload the manuscript to restore speech tags.",
    };
  }

  const lines = await fetchAllTaggedLines<{
    id: string;
    line_order: number;
    paragraph_num: number;
    line_text: string;
  }>(admin, bookId, "id, line_order, paragraph_num, line_text");

  const inserts = findMissingSpeechTagInserts(lines, sourceParagraphs);
  if (inserts.length === 0) {
    return { inserted: 0 };
  }

  const { data: book } = await admin
    .from("books")
    .select("series_id")
    .eq("id", bookId)
    .single();

  const { data: chars } = await admin
    .from("characters")
    .select("*")
    .eq("series_id", book?.series_id ?? "");

  const narrator = findCharacterBySpeaker("Narrator", (chars ?? []) as Character[]);

  let inserted = 0;

  for (const insert of inserts) {
    const newOrder = insert.after_line_order + 1;

    const { data: toShift } = await admin
      .from("tagged_lines")
      .select("id, line_order")
      .eq("book_id", bookId)
      .gte("line_order", newOrder)
      .order("line_order", { ascending: false });

    for (const row of toShift ?? []) {
      await admin
        .from("tagged_lines")
        .update({ line_order: row.line_order + 1 })
        .eq("id", row.id);
    }

    const { error } = await admin.from("tagged_lines").insert({
      book_id: bookId,
      line_order: newOrder,
      paragraph_num: insert.paragraph_num,
      speaker_label: "Narrator",
      speaker_character_id: narrator?.id ?? null,
      line_text: insert.line_text,
      confidence: "high",
      flag_reason: null,
      ai_reviewed: false,
      human_reviewed: false,
    });

    if (error) {
      throw new Error(error.message);
    }
    inserted++;
  }

  await updateBookStatus(admin, bookId);
  return { inserted };
}
