import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/api/auth";
import { characterPatchSchema } from "@/lib/validations";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id } = await params;
  const body = await request.json();
  const parsed = characterPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("characters")
    .select("elevenlabs_voice_id, elevenlabs_voice_name")
    .eq("id", id)
    .single();

  const { data, error: dbError } = await supabase
    .from("characters")
    .update(parsed.data)
    .eq("id", id)
    .select("*, series(id, name, pen_names(name))")
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  if (
    existing &&
    parsed.data.elevenlabs_voice_id !== undefined &&
    (parsed.data.elevenlabs_voice_id !== existing.elevenlabs_voice_id ||
      parsed.data.elevenlabs_voice_name !== existing.elevenlabs_voice_name)
  ) {
    await supabase.from("casting_history").insert({
      character_id: id,
      changed_by: user.id,
      old_voice_id: existing.elevenlabs_voice_id,
      new_voice_id: parsed.data.elevenlabs_voice_id,
      old_voice_name: existing.elevenlabs_voice_name,
      new_voice_name: parsed.data.elevenlabs_voice_name ?? null,
    });
  }

  return NextResponse.json(data);
}

/**
 * Delete a series character. Any lines still attributed to it are reset to
 * UNKNOWN first (the tagged_lines FK has no ON DELETE action, so a referenced
 * character otherwise can't be removed). Removes duplicate / mis-created
 * characters that would otherwise be stuck in the speaker roster.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id } = await params;
  const admin = createAdminClient();

  const { data: character } = await admin
    .from("characters")
    .select("id, canonical_name")
    .eq("id", id)
    .maybeSingle();

  if (!character) {
    return NextResponse.json({ error: "Character not found" }, { status: 404 });
  }

  // Detach every line attributed to this character so the FK can be removed and
  // those lines resurface as UNKNOWN for re-tagging.
  const { data: reassigned, error: reassignError } = await admin
    .from("tagged_lines")
    .update({ speaker_character_id: null, speaker_label: "UNKNOWN" })
    .eq("speaker_character_id", id)
    .select("id");

  if (reassignError) {
    return NextResponse.json({ error: reassignError.message }, { status: 500 });
  }

  // book_characters and casting_history cascade on delete.
  const { error: deleteError } = await admin
    .from("characters")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    name: character.canonical_name,
    reassigned_lines: reassigned?.length ?? 0,
  });
}
