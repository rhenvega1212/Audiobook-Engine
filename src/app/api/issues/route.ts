import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  countOpenIssueReports,
  ensureIssueReportsBucket,
  signedScreenshotUrl,
} from "@/lib/issues/reports";
import type { IssueReportRow } from "@/lib/issues/types";

const contextSchema = z.object({
  pathname: z.string(),
  search: z.string().optional(),
  page_title: z.string().optional(),
  viewport: z.string().optional(),
  user_agent: z.string().optional(),
  captured_at: z.string().optional(),
  book_id: z.string().uuid().optional(),
  line_id: z.string().optional(),
});

export async function GET() {
  const { user, error } = await requireAdmin();
  if (!user) return error;

  const admin = createAdminClient();
  const { data, error: dbError } = await admin
    .from("issue_reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  const reports = await Promise.all(
    ((data ?? []) as IssueReportRow[]).map(async (row) => ({
      ...row,
      screenshot_url: await signedScreenshotUrl(admin, row.screenshot_path),
    }))
  );

  const open_count = await countOpenIssueReports(admin);

  return NextResponse.json({ reports, open_count });
}

export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const formData = await request.formData();
  const description = String(formData.get("description") ?? "").trim();
  const pageUrl = String(formData.get("page_url") ?? "").trim();
  const pageLabel = String(formData.get("page_label") ?? "").trim();
  const contextRaw = formData.get("context");
  const screenshot = formData.get("screenshot");

  if (!description) {
    return NextResponse.json(
      { error: "Please describe what went wrong" },
      { status: 400 }
    );
  }

  if (!pageUrl) {
    return NextResponse.json({ error: "Missing page context" }, { status: 400 });
  }

  if (!(screenshot instanceof File) || screenshot.size === 0) {
    return NextResponse.json(
      { error: "Please attach a screenshot" },
      { status: 400 }
    );
  }

  if (!screenshot.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "Screenshot must be an image" },
      { status: 400 }
    );
  }

  if (screenshot.size > 8 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Screenshot must be under 8 MB" },
      { status: 400 }
    );
  }

  let context: z.infer<typeof contextSchema> = { pathname: "/" };
  if (typeof contextRaw === "string" && contextRaw) {
    const parsed = contextSchema.safeParse(JSON.parse(contextRaw));
    if (parsed.success) context = parsed.data;
  }

  const admin = createAdminClient();

  try {
    await ensureIssueReportsBucket(admin);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Storage setup failed";
    return NextResponse.json(
      {
        error:
          message.includes("Bucket not found") || message.includes("bucket")
            ? "Issue report storage is not set up yet. Ask your admin to run the issue_reports migration in Supabase."
            : message,
      },
      { status: 500 }
    );
  }

  const reportId = crypto.randomUUID();
  const ext =
    screenshot.type === "image/png"
      ? "png"
      : screenshot.type === "image/webp"
        ? "webp"
        : "jpg";
  const storagePath = `${user.id}/${reportId}.${ext}`;
  const buffer = Buffer.from(await screenshot.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from("issue-reports")
    .upload(storagePath, buffer, {
      contentType: screenshot.type,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: row, error: insertError } = await admin
    .from("issue_reports")
    .insert({
      id: reportId,
      description,
      page_url: pageUrl,
      page_label: pageLabel || null,
      context_json: context,
      screenshot_path: storagePath,
      reported_by: user.id,
      reporter_email: user.email ?? "unknown",
      status: "open",
    })
    .select("id, created_at")
    .single();

  if (insertError) {
    await admin.storage.from("issue-reports").remove([storagePath]);
    const message =
      insertError.message.includes("issue_reports") &&
      insertError.message.includes("does not exist")
        ? "Issue reports table is not set up yet. Run supabase/migrations/20250617000002_issue_reports.sql in the Supabase SQL editor."
        : insertError.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ id: row.id, created_at: row.created_at }, { status: 201 });
}
