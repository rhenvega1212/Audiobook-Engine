import type { Character } from "@/lib/types/database";

/** Match speaker label to roster row (canonical name or alias). */
export function findCharacterBySpeaker(
  speaker: string,
  characters: Character[]
): Character | undefined {
  if (!speaker || speaker === "UNKNOWN") {
    return undefined;
  }
  if (speaker === "Narrator") {
    return characters.find((c) => c.canonical_name === "Narrator");
  }
  const lower = speaker.toLowerCase().trim();
  return characters.find(
    (c) =>
      c.canonical_name.toLowerCase() === lower ||
      (c.aliases ?? []).some((a) => a.toLowerCase() === lower)
  );
}
