import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/api/auth";
import { mergeSpeakerAlias } from "@/lib/books/merge-alias";

const bodySchema = z.object({
  alias_name: z.string().min(1).max(200),
  target_character_id: z.string().uuid(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id: bookId } = await params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    const result = await mergeSpeakerAlias(
      admin,
      bookId,
      parsed.data.alias_name,
      parsed.data.target_character_id
    );
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Merge failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
