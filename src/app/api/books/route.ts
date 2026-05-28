import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/api/auth";

export async function GET() {
  const { user, error } = await requireUser();
  if (!user) return error;

  const supabase = await createClient();
  const { data, error: dbError } = await supabase
    .from("books")
    .select("*, series(id, name, pen_names(name))")
    .order("updated_at", { ascending: false });

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const formData = await request.formData();
  const seriesId = formData.get("series_id") as string;
  const title = formData.get("title") as string;
  const file = formData.get("file") as File | null;

  if (!seriesId || !title || !file) {
    return NextResponse.json(
      { error: "series_id, title, and file are required" },
      { status: 400 }
    );
  }

  if (!file.name.endsWith(".docx")) {
    return NextResponse.json(
      { error: "Only .docx files are supported" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: book, error: bookError } = await admin
    .from("books")
    .insert({
      series_id: seriesId,
      title,
      status: "uploaded",
      uploaded_by: user.id,
    })
    .select()
    .single();

  if (bookError || !book) {
    return NextResponse.json(
      { error: bookError?.message ?? "Failed to create book" },
      { status: 500 }
    );
  }

  const path = `${seriesId}/${book.id}/manuscript.docx`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from("manuscripts")
    .upload(path, buffer, {
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    });

  if (uploadError) {
    await admin.from("books").delete().eq("id", book.id);
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  await admin
    .from("books")
    .update({ manuscript_path: path })
    .eq("id", book.id);

  return NextResponse.json(
    {
      id: book.id,
      ...book,
      manuscript_path: path,
      analyze_required: true,
    },
    { status: 201 }
  );
}
