import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookStatus } from "@/lib/types/database";
import { lineNeedsHumanReview } from "@/lib/books/flagged-lines";

export async function computeBookStatus(
  admin: SupabaseClient,
  bookId: string
): Promise<BookStatus> {
  const { data: book } = await admin
    .from("books")
    .select("status")
    .eq("id", bookId)
    .single();

  if (!book || book.status === "uploaded") {
    return (book?.status as BookStatus) ?? "uploaded";
  }

  const { data: bookChars } = await admin
    .from("book_characters")
    .select("character_id, characters(elevenlabs_voice_id, canonical_name)")
    .eq("book_id", bookId);

  const castRows =
    bookChars?.map((bc) => {
      const raw = bc.characters as
        | { elevenlabs_voice_id: string | null; canonical_name: string }
        | { elevenlabs_voice_id: string | null; canonical_name: string }[]
        | null;
      if (!raw) return null;
      return Array.isArray(raw) ? raw[0] ?? null : raw;
    }) ?? [];

  const allCast =
    castRows.length > 0 &&
    castRows.every((c) => c && c.elevenlabs_voice_id);

  const { data: flaggedLines } = await admin
    .from("tagged_lines")
    .select("flag_reason, human_reviewed")
    .eq("book_id", bookId)
    .not("flag_reason", "is", null);

  const hasFlags = (flaggedLines ?? []).some((l) => lineNeedsHumanReview(l));

  if (!allCast) return "needs_casting";
  if (hasFlags) return "reviewing";
  if (book.status === "exported") return "exported";
  return "ready_for_export";
}

export async function updateBookStatus(
  admin: SupabaseClient,
  bookId: string
): Promise<BookStatus> {
  const status = await computeBookStatus(admin, bookId);
  await admin.from("books").update({ status }).eq("id", bookId);
  return status;
}
