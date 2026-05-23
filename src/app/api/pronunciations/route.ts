import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/api/auth";
import { pronunciationSchema } from "@/lib/validations";

export async function GET(request: Request) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const seriesId = new URL(request.url).searchParams.get("series_id");
  if (!seriesId) {
    return NextResponse.json(
      { error: "series_id is required" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data, error: dbError } = await supabase
    .from("pronunciations")
    .select("*")
    .eq("series_id", seriesId)
    .order("word");

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const body = await request.json();
  const parsed = pronunciationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error: dbError } = await supabase
    .from("pronunciations")
    .insert(parsed.data)
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
