import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTeamManage } from "@/lib/auth/admin";
import { adminUpdatePasswordSchema } from "@/lib/validations";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user: adminUser, error } = await requireTeamManage();
  if (error) return error;

  const { id } = await params;
  const body = await request.json();
  const parsed = adminUpdatePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (adminUser!.id === id) {
    return NextResponse.json(
      { error: "Use account settings to change your own password" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error: updateError } = await admin.auth.admin.updateUserById(id, {
    password: parsed.data.password,
  });

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user: adminUser, error } = await requireTeamManage();
  if (error) return error;

  const { id } = await params;

  if (adminUser!.id === id) {
    return NextResponse.json(
      { error: "You cannot delete your own account" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error: deleteError } = await admin.auth.admin.deleteUser(id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
