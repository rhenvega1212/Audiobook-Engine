import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/api/auth";
import {
  addManualChapterStart,
  rebuildAutoBookChapters,
  type BookChapterRow,
} from "@/lib/books/book-chapters";

const createChapterSchema = z.object({
  line_id: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id: bookId } = await params;
  const supabase = await createClient();

  const { data, error: fetchError } = await supabase
    .from("book_chapters")
    .select("id, book_id, sort_order, title, start_line_id, start_line_order, source")
    .eq("book_id", bookId)
    .order("start_line_order");

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  return NextResponse.json({ chapters: (data ?? []) as BookChapterRow[] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id: bookId } = await params;
  const body = await request.json();
  const admin = createAdminClient();

  try {
    if ((body as { action?: string }).action === "rebuild") {
      const count = await rebuildAutoBookChapters(admin, bookId);
      const { data } = await admin
        .from("book_chapters")
        .select("id, book_id, sort_order, title, start_line_id, start_line_order, source")
        .eq("book_id", bookId)
        .order("start_line_order");
      return NextResponse.json({ chapters: data ?? [], rebuilt: count });
    }

    const parsed = createChapterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const chapters = await addManualChapterStart(
      admin,
      bookId,
      parsed.data.line_id,
      parsed.data.title ?? ""
    );
    return NextResponse.json({ chapters });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Chapter update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
