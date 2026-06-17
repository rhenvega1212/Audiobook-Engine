import type { SupabaseClient } from "@supabase/supabase-js";

const ISSUE_REPORTS_BUCKET = "issue-reports";

export async function ensureIssueReportsBucket(
  admin: SupabaseClient
): Promise<void> {
  const { data: buckets, error: listError } = await admin.storage.listBuckets();
  if (listError) {
    throw new Error(listError.message);
  }
  if (buckets?.some((b) => b.id === ISSUE_REPORTS_BUCKET)) {
    return;
  }

  const { error: createError } = await admin.storage.createBucket(
    ISSUE_REPORTS_BUCKET,
    {
      public: false,
      fileSizeLimit: 8 * 1024 * 1024,
      allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
    }
  );

  if (
    createError &&
    !createError.message.toLowerCase().includes("already exists")
  ) {
    throw new Error(createError.message);
  }
}

export async function countOpenIssueReports(
  client: SupabaseClient
): Promise<number> {
  const { count, error } = await client
    .from("issue_reports")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");

  if (error) return 0;
  return count ?? 0;
}

export async function signedScreenshotUrl(
  client: SupabaseClient,
  path: string | null,
  expiresIn = 3600
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await client.storage
    .from(ISSUE_REPORTS_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
