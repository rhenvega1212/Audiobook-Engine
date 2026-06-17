import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/layout/page-header";
import {
  countOpenIssueReports,
  signedScreenshotUrl,
} from "@/lib/issues/reports";
import type { IssueReportRow } from "@/lib/issues/types";
import { IssuesInboxClient } from "./issues-inbox-client";

export const dynamic = "force-dynamic";

export default async function AdminIssuesPage() {
  const { user } = await requireAdmin();
  if (!user) redirect("/dashboard");

  const admin = createAdminClient();
  const { data } = await admin
    .from("issue_reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  const reports = await Promise.all(
    ((data ?? []) as IssueReportRow[]).map(async (row) => ({
      ...row,
      screenshot_url: await signedScreenshotUrl(admin, row.screenshot_path),
    }))
  );

  const openCount = await countOpenIssueReports(admin);

  return (
    <>
      <PageHeader
        title="Issue reports"
        description="Screenshots and notes from your team while they test. Resolve when fixed."
      />
      <IssuesInboxClient
        initialReports={reports}
        initialOpenCount={openCount}
      />
    </>
  );
}
