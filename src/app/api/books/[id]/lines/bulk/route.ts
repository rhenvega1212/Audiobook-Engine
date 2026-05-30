import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/api/auth";
import { lineBulkUpdateSchema } from "@/lib/validations";
import { updateBookStatus } from "@/lib/books/compute-book-status";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id: bookId } = await params;
  const body = await request.json();
  const parsed = lineBulkUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { line_ids, ...fields } = parsed.data;
  const updates = {
    ...fields,
    ...(fields.flag_reason === null ? { human_reviewed: true } : {}),
    ...(fields.speaker_label != null ? { human_reviewed: true } : {}),
  };

  const supabase = await createClient();
  const { data, error: dbError } = await supabase
    .from("tagged_lines")
    .update(updates)
    .eq("book_id", bookId)
    .in("id", line_ids)
    .select("id");

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  const admin = createAdminClient();
  const status = await updateBookStatus(admin, bookId);

  return NextResponse.json({
    updated: data?.length ?? 0,
    book_status: status,
  });
}
