/** Edge-safe admin check (no server-only imports). Used in middleware. */

export function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  const admins = getAdminEmails();
  if (admins.length === 0) return false;
  return admins.includes(email.trim().toLowerCase());
}

export function getHomePathForEmail(email: string | undefined | null): string {
  return isAdminEmail(email) ? "/admin/users" : "/dashboard";
}
