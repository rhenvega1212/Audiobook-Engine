import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminAccess, requireTeamManage } from "@/lib/auth/admin";
import { listAuthUsers } from "@/lib/auth/list-users";
import { adminCreateUserSchema } from "@/lib/validations";

export async function GET() {
  const { error } = await requireAdminAccess();
  if (error) return error;

  const { users, error: listError } = await listAuthUsers();

  if (listError) {
    return NextResponse.json({ error: listError }, { status: 500 });
  }

  return NextResponse.json(users);
}

export async function POST(request: Request) {
  const { error } = await requireTeamManage();
  if (error) return error;

  const body = await request.json();
  const parsed = adminCreateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error: createError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  });

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      id: data.user.id,
      email: data.user.email,
      created_at: data.user.created_at,
    },
    { status: 201 }
  );
}
