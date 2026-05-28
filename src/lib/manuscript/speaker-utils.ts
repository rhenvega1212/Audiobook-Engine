import type { Character } from "@/lib/types/database";

export const NARRATOR_VALUE = "__narrator__";
export const UNKNOWN_VALUE = "__unknown__";

export function speakerValueForLine(
  line: {
    speaker_character_id?: string | null;
    speaker_label: string;
  },
  characters: Pick<Character, "id" | "canonical_name" | "aliases">[]
): string {
  if (line.speaker_character_id) return line.speaker_character_id;
  if (line.speaker_label === "Narrator") return NARRATOR_VALUE;
  if (line.speaker_label === "UNKNOWN") return UNKNOWN_VALUE;
  const match = characters.find(
    (c) =>
      c.canonical_name === line.speaker_label ||
      (c.aliases ?? []).some((a) => a === line.speaker_label)
  );
  return match?.id ?? UNKNOWN_VALUE;
}

export function resolveSpeaker(
  value: string,
  characters: Pick<Character, "id" | "canonical_name">[],
  /** Freshly created character not yet in roster state */
  hint?: Pick<Character, "id" | "canonical_name">
): {
  speaker_label: string;
  speaker_character_id: string | null;
} {
  if (value === NARRATOR_VALUE) {
    return { speaker_label: "Narrator", speaker_character_id: null };
  }
  if (value === UNKNOWN_VALUE) {
    return { speaker_label: "UNKNOWN", speaker_character_id: null };
  }
  const char =
    characters.find((c) => c.id === value) ??
    (hint?.id === value ? hint : undefined);
  return {
    speaker_label: char?.canonical_name ?? "UNKNOWN",
    speaker_character_id: char?.id ?? null,
  };
}
