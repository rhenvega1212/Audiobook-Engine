import type { SupabaseClient } from "@supabase/supabase-js";
import { updateBookStatus } from "./compute-book-status";
import { createUndoCheckpoint } from "./manuscript-snapshot";

const PROTECTED_SPEAKERS = new Set(["narrator", "unknown"]);

function assertEditableSpeaker(label: string) {
  if (PROTECTED_SPEAKERS.has(label.trim().toLowerCase())) {
    throw new Error(`Cannot modify "${label}"`);
  }
}

/**
 * Remove a detected speaker from this book. Lines become UNKNOWN. When a series
 * character row exists, it is deleted (series-wide line reset, same as the
 * character library delete).
 */
export async function removeDetectedSpeaker(
  admin: SupabaseClient,
  bookId: string,
  options: { speakerLabel: string; characterId?: string | null }
) {
  const speakerLabel = options.speakerLabel.trim();
  assertEditableSpeaker(speakerLabel);

  await createUndoCheckpoint(
    admin,
    bookId,
    `Before removing "${speakerLabel}"`,
    { includeCharacters: !!options.characterId }
  );

  let reassigned = 0;

  if (options.characterId) {
    const { data: character } = await admin
      .from("characters")
      .select("id, canonical_name")
      .eq("id", options.characterId)
      .maybeSingle();

    if (!character) throw new Error("Character not found");
    assertEditableSpeaker(character.canonical_name);

    const { data: rows, error: reassignError } = await admin
      .from("tagged_lines")
      .update({ speaker_character_id: null, speaker_label: "UNKNOWN" })
      .eq("speaker_character_id", options.characterId)
      .select("id");

    if (reassignError) throw new Error(reassignError.message);
    reassigned = rows?.length ?? 0;

    const { error: deleteError } = await admin
      .from("characters")
      .delete()
      .eq("id", options.characterId);

    if (deleteError) throw new Error(deleteError.message);
  } else {
    const { data: rows, error } = await admin
      .from("tagged_lines")
      .update({ speaker_character_id: null, speaker_label: "UNKNOWN" })
      .eq("book_id", bookId)
      .eq("speaker_label", speakerLabel)
      .select("id");

    if (error) throw new Error(error.message);
    reassigned = rows?.length ?? 0;
  }

  const status = await updateBookStatus(admin, bookId);
  return { reassigned_lines: reassigned, status };
}

/**
 * Rename a detected speaker and apply the new label to all of their lines on
 * this book. When a series character row exists, update canonical_name and
 * relabel every line linked to that character (series-wide).
 */
export async function renameDetectedSpeaker(
  admin: SupabaseClient,
  bookId: string,
  options: {
    speakerLabel: string;
    newName: string;
    characterId?: string | null;
  }
) {
  const speakerLabel = options.speakerLabel.trim();
  const newName = options.newName.trim();
  assertEditableSpeaker(speakerLabel);
  assertEditableSpeaker(newName);

  if (speakerLabel.toLowerCase() === newName.toLowerCase()) {
    throw new Error("New name must be different");
  }

  await createUndoCheckpoint(
    admin,
    bookId,
    `Before renaming "${speakerLabel}" to "${newName}"`,
    { includeCharacters: !!options.characterId }
  );

  let linesUpdated = 0;

  if (options.characterId) {
    const { data: character } = await admin
      .from("characters")
      .select("id, canonical_name")
      .eq("id", options.characterId)
      .maybeSingle();

    if (!character) throw new Error("Character not found");
    assertEditableSpeaker(character.canonical_name);

    const { error: charError } = await admin
      .from("characters")
      .update({ canonical_name: newName })
      .eq("id", options.characterId);

    if (charError) throw new Error(charError.message);

    const { data: byChar, error: lineError } = await admin
      .from("tagged_lines")
      .update({
        speaker_label: newName,
        speaker_character_id: options.characterId,
      })
      .eq("speaker_character_id", options.characterId)
      .select("id");

    if (lineError) throw new Error(lineError.message);
    linesUpdated = byChar?.length ?? 0;

    // Lines on this book that used the old label without a character link.
    const { data: byLabel } = await admin
      .from("tagged_lines")
      .update({
        speaker_label: newName,
        speaker_character_id: options.characterId,
      })
      .eq("book_id", bookId)
      .eq("speaker_label", speakerLabel)
      .is("speaker_character_id", null)
      .select("id");

    linesUpdated += byLabel?.length ?? 0;
  } else {
    const { data: rows, error } = await admin
      .from("tagged_lines")
      .update({ speaker_label: newName })
      .eq("book_id", bookId)
      .eq("speaker_label", speakerLabel)
      .select("id");

    if (error) throw new Error(error.message);
    linesUpdated = rows?.length ?? 0;
  }

  const status = await updateBookStatus(admin, bookId);
  return { lines_updated: linesUpdated, status };
}
