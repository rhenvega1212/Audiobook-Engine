import type { EngineCharacter } from "./types";

/**
 * Map a single token (e.g. "Nikki") to one roster character when canonical
 * is "First Last" or aliases include the token. Returns null if ambiguous.
 */
export function resolveFirstNameToCanonical(
  token: string,
  roster: EngineCharacter[]
): EngineCharacter | null {
  const t = token.trim().toLowerCase();
  if (!t || t.includes(" ")) return null;

  const matches = roster.filter((c) => {
    if (c.canonical_name.toLowerCase() === t) return true;
    if ((c.aliases ?? []).some((a) => a.toLowerCase() === t)) return true;
    const parts = c.canonical_name.trim().split(/\s+/);
    if (parts.length >= 2 && parts[0].toLowerCase() === t) return true;
    return false;
  });

  if (matches.length !== 1) return null;
  return matches[0];
}
