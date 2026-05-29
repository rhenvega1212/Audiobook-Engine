import type { Character, CharacterRole } from "@/lib/types/database";

/** Roles that must be cast-ready before manuscript analyze. */
export const ANALYZE_REQUIRED_ROLES: CharacterRole[] = [
  "narrator",
  "protagonist",
  "series_regular",
  "recurring",
];

export type AnalyzeReadinessIssue = {
  character_id: string;
  canonical_name: string;
  role: CharacterRole;
  issue: "missing_alias" | "missing_canonical_name";
};

function hasUsableAlias(c: Character): boolean {
  const aliases = (c.aliases ?? []).map((a) => a.trim()).filter(Boolean);
  if (aliases.length > 0) return true;
  // Two-word canonical: first name counts as implicit alias for matching
  const parts = c.canonical_name.trim().split(/\s+/);
  return parts.length >= 2 && parts[0].length > 0;
}

export function checkSeriesAnalyzeReadiness(
  characters: Character[]
): { ready: boolean; issues: AnalyzeReadinessIssue[] } {
  const issues: AnalyzeReadinessIssue[] = [];

  for (const c of characters) {
    if (!ANALYZE_REQUIRED_ROLES.includes(c.role ?? "guest")) continue;

    if (!c.canonical_name?.trim()) {
      issues.push({
        character_id: c.id,
        canonical_name: c.canonical_name ?? "(unnamed)",
        role: c.role ?? "guest",
        issue: "missing_canonical_name",
      });
      continue;
    }

    if (!hasUsableAlias(c)) {
      issues.push({
        character_id: c.id,
        canonical_name: c.canonical_name,
        role: c.role ?? "guest",
        issue: "missing_alias",
      });
    }
  }

  return { ready: issues.length === 0, issues };
}
