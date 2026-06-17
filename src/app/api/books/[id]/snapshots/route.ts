import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/api/auth";
import { updateBookStatus } from "@/lib/books/compute-book-status";
import {
  createManuscriptSnapshot,
  listManuscriptSnapshots,
  restoreManuscriptSnapshot,
} from "@/lib/books/manuscript-snapshot";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id } = await params;
  const admin = createAdminClient();
  const snapshots = await listManuscriptSnapshots(admin, id);

  return NextResponse.json({
    snapshots,
    can_restore: snapshots.length > 0,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id } = await params;
  const admin = createAdminClient();

  let body: { action?: string; snapshot_id?: string; label?: string } = {};
  try {
    body = await request.json();
  } catch {
    // empty body defaults to create
  }

  if (body.action === "restore") {
    try {
      const { restored, snapshot } = await restoreManuscriptSnapshot(
        admin,
        id,
        body.snapshot_id
      );
      const status = await updateBookStatus(admin, id);
      return NextResponse.json({ restored, snapshot, status });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Restore failed";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const snap = await createManuscriptSnapshot(admin, id, {
    label: body.label?.trim() || "Manual restore point",
    source: "manual",
  });

  if (!snap) {
    return NextResponse.json(
      { error: "Could not save restore point (no lines or table missing)" },
      { status: 400 }
    );
  }

  return NextResponse.json({ snapshot: snap, created: true });
}
