import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { z } from "zod";

const bodySchema = z.object({
  enabled: z.boolean(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user: superAdmin, error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await request.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (superAdmin!.id === id) {
    return NextResponse.json(
      { error: "Super admins always have full access" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  if (parsed.data.enabled) {
    const { data: target, error: getError } =
      await admin.auth.admin.getUserById(id);
    if (getError || !target.user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { error: insertError } = await admin.from("team_manager_grants").upsert(
      {
        user_id: id,
        email: target.user.email ?? "",
        granted_by: superAdmin!.id,
      },
      { onConflict: "user_id" }
    );

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  } else {
    const { error: deleteError } = await admin
      .from("team_manager_grants")
      .delete()
      .eq("user_id", id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true, enabled: parsed.data.enabled });
}
