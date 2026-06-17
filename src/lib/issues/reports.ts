import type { SupabaseClient } from "@supabase/supabase-js";

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
    .from("issue-reports")
    .createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
