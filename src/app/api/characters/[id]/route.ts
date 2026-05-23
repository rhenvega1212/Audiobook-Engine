import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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
