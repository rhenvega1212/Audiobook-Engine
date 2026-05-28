import type { Character, CharacterRole } from "@/lib/types/database";
import { CANONICAL_CAST_NAMES } from "@/lib/engine/unknown-speaker";

export type CastStatus = "cast" | "needs_voice";

export type LibraryCharacter = Character & {
  total_lines: number;
  book_count: number;
  effective_role: CharacterRole;
  tier_label: string;
  cast_status: CastStatus;
};

export const ROLE_SORT_ORDER: Record<CharacterRole, number> = {
  protagonist: 0,
  series_regular: 1,
  narrator: 2,
  recurring: 3,
  guest: 4,
};

export const ROLE_LABELS: Record<CharacterRole, string> = {
  protagonist: "Lead",
  series_regular: "Main",
  narrator: "Narrator",
  recurring: "Side",
  guest: "Guest",
};

const SIDE_LINE_MIN = 5;
const MAIN_LINE_MIN = 50;

/** Manual DB role wins; otherwise infer from cast membership and dialogue volume. */
export function resolveEffectiveRole(
  character: Pick<Character, "canonical_name" | "role">,
  totalLines: number
): CharacterRole {
  const stored = character.role;
  if (stored && stored !== "guest") return stored;

  if (character.canonical_name === "Narrator") return "narrator";
  if (character.canonical_name === "Nikki Sands") return "protagonist";
  if (CANONICAL_CAST_NAMES.has(character.canonical_name)) {
    return "series_regular";
  }

  if (totalLines >= MAIN_LINE_MIN) return "recurring";
  if (totalLines >= SIDE_LINE_MIN) return "recurring";
  return "guest";
}

export function getCastStatus(
  character: Pick<Character, "canonical_name" | "elevenlabs_voice_id">
): CastStatus {
  if (character.canonical_name === "Narrator") {
    return character.elevenlabs_voice_id ? "cast" : "needs_voice";
  }
  return character.elevenlabs_voice_id ? "cast" : "needs_voice";
}

export function enrichLibraryCharacter(
  character: Character,
  stats: { total_lines: number; book_count: number }
): LibraryCharacter {
  const effective_role = resolveEffectiveRole(character, stats.total_lines);
  return {
    ...character,
    ...stats,
    effective_role,
    tier_label: ROLE_LABELS[effective_role],
    cast_status: getCastStatus(character),
  };
}

export type CharacterSortKey =
  | "priority"
  | "lines_desc"
  | "lines_asc"
  | "name"
  | "gender";

export function sortLibraryCharacters(
  rows: LibraryCharacter[],
  sortKey: CharacterSortKey
): LibraryCharacter[] {
  const sorted = [...rows];
  switch (sortKey) {
    case "lines_desc":
      return sorted.sort(
        (a, b) =>
          b.total_lines - a.total_lines ||
          a.canonical_name.localeCompare(b.canonical_name)
      );
    case "lines_asc":
      return sorted.sort(
        (a, b) =>
          a.total_lines - b.total_lines ||
          a.canonical_name.localeCompare(b.canonical_name)
      );
    case "name":
      return sorted.sort((a, b) =>
        a.canonical_name.localeCompare(b.canonical_name)
      );
    case "gender":
      return sorted.sort(
        (a, b) =>
          a.gender.localeCompare(b.gender) ||
          ROLE_SORT_ORDER[a.effective_role] - ROLE_SORT_ORDER[b.effective_role] ||
          b.total_lines - a.total_lines
      );
    case "priority":
    default:
      return sorted.sort((a, b) => {
        const roleDiff =
          ROLE_SORT_ORDER[a.effective_role] - ROLE_SORT_ORDER[b.effective_role];
        if (roleDiff !== 0) return roleDiff;
        if (a.cast_status !== b.cast_status) {
          return a.cast_status === "needs_voice" ? -1 : 1;
        }
        if (b.total_lines !== a.total_lines) return b.total_lines - a.total_lines;
        return a.canonical_name.localeCompare(b.canonical_name);
      });
  }
}

export function aggregateBookCharacterStats(
  bookCharacters: { character_id: string; line_count: number; book_id: string }[]
): Map<string, { total_lines: number; book_count: number }> {
  const map = new Map<string, { total_lines: number; book_ids: Set<string> }>();
  for (const row of bookCharacters) {
    const cur = map.get(row.character_id) ?? {
      total_lines: 0,
      book_ids: new Set<string>(),
    };
    cur.total_lines += row.line_count ?? 0;
    cur.book_ids.add(row.book_id);
    map.set(row.character_id, cur);
  }
  const out = new Map<string, { total_lines: number; book_count: number }>();
  for (const [id, { total_lines, book_ids }] of map) {
    out.set(id, { total_lines, book_count: book_ids.size });
  }
  return out;
}

export const GENDER_LABELS: Record<Character["gender"], string> = {
  male: "M",
  female: "F",
  unknown: "—",
};
