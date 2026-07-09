import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/api/auth";
import { z } from "zod";

const mergeSchema = z.object({ target_id: z.string().min(1) });

/**
 * Merge one character into another: every line attributed to the source
 * character is re-attributed to the target, the source's name/aliases are
 * folded into the target's aliases (so future auto-attribution still matches
 * the old name), the target is linked to any affected books, and the source
 * character is deleted. Used to collapse duplicate characters (e.g. "Kristof"
 * into "Kristof Waltman") without losing any tagging.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id: sourceId } = await params;
  const body = await request.json();
  const parsed = mergeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid merge target" }, { status: 400 });
  }
  const targetId = parsed.data.target_id;
  if (targetId === sourceId) {
    return NextResponse.json(
      { error: "Cannot merge a character into itself" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: chars } = await admin
    .from("characters")
    .select("id, canonical_name, aliases, series_id")
    .in("id", [sourceId, targetId]);

  const source = chars?.find((c) => c.id === sourceId);
  const target = chars?.find((c) => c.id === targetId);
  if (!source || !target) {
    return NextResponse.json({ error: "Character not found" }, { status: 404 });
  }
  if (source.series_id !== target.series_id) {
    return NextResponse.json(
      { error: "Characters belong to different series" },
      { status: 400 }
    );
  }

  const { data: reassigned, error: reassignError } = await admin
    .from("tagged_lines")
    .update({
      speaker_character_id: targetId,
      speaker_label: target.canonical_name,
    })
    .eq("speaker_character_id", sourceId)
    .select("id, book_id");

  if (reassignError) {
    return NextResponse.json({ error: reassignError.message }, { status: 500 });
  }

  // Fold the source name + aliases into the target's aliases.
  const mergedAliases = Array.from(
    new Set(
      [
        ...(target.aliases ?? []),
        source.canonical_name,
        ...(source.aliases ?? []),
      ].filter((a): a is string => !!a && a !== target.canonical_name)
    )
  );
  await admin
    .from("characters")
    .update({ aliases: mergedAliases })
    .eq("id", targetId);

  // Make sure the target is linked to every book the moved lines belong to.
  const bookIds = Array.from(
    new Set((reassigned ?? []).map((r) => r.book_id).filter(Boolean))
  );
  if (bookIds.length > 0) {
    await admin.from("book_characters").upsert(
      bookIds.map((book_id) => ({
        book_id,
        character_id: targetId,
        line_count: 0,
      })),
      { onConflict: "book_id,character_id" }
    );
  }

  // book_characters + casting_history for the source cascade on delete.
  const { error: deleteError } = await admin
    .from("characters")
    .delete()
    .eq("id", sourceId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    target_id: targetId,
    target_name: target.canonical_name,
    source_name: source.canonical_name,
    reassigned_lines: reassigned?.length ?? 0,
  });
}
