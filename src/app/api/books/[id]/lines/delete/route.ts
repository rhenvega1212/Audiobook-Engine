import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/api/auth";
import { lineDeleteSchema } from "@/lib/validations";
import { deleteTaggedLines } from "@/lib/books/line-operations";
import { createUndoCheckpoint } from "@/lib/books/manuscript-snapshot";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id: bookId } = await params;
  const body = await request.json();
  const parsed = lineDeleteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    await createUndoCheckpoint(admin, bookId, "Before line delete");
    const result = await deleteTaggedLines(admin, bookId, parsed.data.line_ids);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
