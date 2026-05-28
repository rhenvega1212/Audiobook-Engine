import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/api/auth";
import { lineUpdateSchema } from "@/lib/validations";
import { updateBookStatus } from "@/lib/books/compute-book-status";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; lineId: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id, lineId } = await params;
  const body = await request.json();
  const parsed = lineUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createClient();
  const updates = {
    ...parsed.data,
    human_reviewed: parsed.data.human_reviewed ?? true,
  };

  const { data, error: dbError } = await supabase
    .from("tagged_lines")
    .update(updates)
    .eq("id", lineId)
    .eq("book_id", id)
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  const admin = createAdminClient();
  const status = await updateBookStatus(admin, id);

  return NextResponse.json({ ...data, book_status: status });
}
