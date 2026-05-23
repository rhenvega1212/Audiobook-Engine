import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/api/auth";
import { characterSchema } from "@/lib/validations";

export async function GET(request: Request) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { searchParams } = new URL(request.url);
  const seriesId = searchParams.get("series_id");
  const penNameId = searchParams.get("pen_name_id");

  const supabase = await createClient();
  let query = supabase
    .from("characters")
    .select("*, series(id, name, pen_name_id, pen_names(name))")
    .order("canonical_name");

  if (seriesId) query = query.eq("series_id", seriesId);

  const { data, error: dbError } = await query;

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  let filtered = data ?? [];
  if (penNameId) {
    filtered = filtered.filter(
      (c) =>
        (c.series as { pen_name_id?: string })?.pen_name_id === penNameId
    );
  }

  return NextResponse.json(filtered);
}

export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const body = await request.json();
  const parsed = characterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error: dbError } = await supabase
    .from("characters")
    .insert({
      ...parsed.data,
      aliases: parsed.data.aliases ?? [],
      gender: parsed.data.gender ?? "unknown",
    })
    .select("*, series(id, name, pen_names(name))")
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
