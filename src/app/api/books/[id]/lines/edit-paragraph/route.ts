import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/api/auth";
import { lineEditParagraphSchema } from "@/lib/validations";
import { editParagraphLines } from "@/lib/books/line-operations";
import { createUndoCheckpoint } from "@/lib/books/manuscript-snapshot";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id: bookId } = await params;
  const body = await request.json();
  const parsed = lineEditParagraphSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    await createUndoCheckpoint(admin, bookId, "Before paragraph edit");
    const result = await editParagraphLines(
      admin,
      bookId,
      parsed.data.line_ids,
      parsed.data.text
    );
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Edit failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
