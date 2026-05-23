import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/api/auth";
import { lineUpdateSchema } from "@/lib/validations";

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
  const { data, error: dbError } = await supabase
    .from("tagged_lines")
    .update({
      ...parsed.data,
      human_reviewed: parsed.data.human_reviewed ?? true,
    })
    .eq("id", lineId)
    .eq("book_id", id)
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
