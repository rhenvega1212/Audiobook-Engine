import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/api/auth";
import { penNameSchema } from "@/lib/validations";

export async function GET() {
  const { user, error } = await requireUser();
  if (!user) return error;

  const supabase = await createClient();
  const { data, error: dbError } = await supabase
    .from("pen_names")
    .select("*")
    .order("name");

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const body = await request.json();
  const parsed = penNameSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error: dbError } = await supabase
    .from("pen_names")
    .insert(parsed.data)
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
