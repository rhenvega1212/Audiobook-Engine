import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/api/auth";
import { seriesSchema } from "@/lib/validations";

export async function GET(request: Request) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { searchParams } = new URL(request.url);
  const penNameId = searchParams.get("pen_name_id");

  const supabase = await createClient();
  let query = supabase
    .from("series")
    .select("*, pen_names(name)")
    .order("name");

  if (penNameId) {
    query = query.eq("pen_name_id", penNameId);
  }

  const { data, error: dbError } = await query;

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const body = await request.json();
  const parsed = seriesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error: dbError } = await supabase
    .from("series")
    .insert(parsed.data)
    .select("*, pen_names(name)")
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
