import { findCharacterBySpeaker } from "@/lib/characters/resolve-character";
import type { Character } from "@/lib/types/database";
import type { SpeakerCharacter } from "@/components/books/speaker-select";

type LineSpeaker = {
  speaker_label: string;
  speaker_character_id: string | null;
};

/** Prefer the character row with the most lines on this book when names collide. */
function dedupeSeriesCharacters(
  characters: Character[],
  lineCountsByCharId: Map<string, number>
): Character[] {
  const byCanonical = new Map<string, Character>();
  for (const c of characters) {
    if (c.canonical_name.toLowerCase() === "narrator") continue;
    const key = c.canonical_name.toLowerCase();
    const existing = byCanonical.get(key);
    if (!existing) {
      byCanonical.set(key, c);
      continue;
    }
    const existingCount = lineCountsByCharId.get(existing.id) ?? 0;
    const nextCount = lineCountsByCharId.get(c.id) ?? 0;
    if (nextCount > existingCount) byCanonical.set(key, c);
  }
  return [...byCanonical.values()];
}

function resolveCharacterForLabel(
  label: string,
  votes: Map<string, number>,
  characters: Character[]
): Character | undefined {
  if (votes.size > 0) {
    const bestId = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    const voted = characters.find((c) => c.id === bestId);
    if (voted) return voted;
  }
  return findCharacterBySpeaker(label, characters);
}

/**
 * Build the speaker picker roster for Speaker Studio — one entry per speaker
 * label that appears on this book's lines (same source as Detected characters),
 * not every series character row. Collapses duplicate DB rows that share a
 * canonical name (e.g. two "Lina" characters).
 */
export function buildSpeakerStudioRoster(
  lines: LineSpeaker[],
  characters: Character[]
): SpeakerCharacter[] {
  const lineCountsByCharId = new Map<string, number>();
  const labelVotes = new Map<string, Map<string, number>>();

  for (const line of lines) {
    const label = line.speaker_label;
    if (label === "Narrator") continue;

    if (line.speaker_character_id) {
      lineCountsByCharId.set(
        line.speaker_character_id,
        (lineCountsByCharId.get(line.speaker_character_id) ?? 0) + 1
      );
      const votes = labelVotes.get(label) ?? new Map<string, number>();
      votes.set(
        line.speaker_character_id,
        (votes.get(line.speaker_character_id) ?? 0) + 1
      );
      labelVotes.set(label, votes);
    } else if (!labelVotes.has(label)) {
      labelVotes.set(label, new Map());
    }
  }

  const dedupedCharacters = dedupeSeriesCharacters(characters, lineCountsByCharId);

  const roster: SpeakerCharacter[] = [];
  const seenCharacterIds = new Set<string>();

  const sortedLabels = [...labelVotes.keys()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );

  for (const label of sortedLabels) {
    const char = resolveCharacterForLabel(
      label,
      labelVotes.get(label) ?? new Map(),
      dedupedCharacters
    );
    if (!char || seenCharacterIds.has(char.id)) continue;
    seenCharacterIds.add(char.id);

    roster.push({
      id: char.id,
      // Use the manuscript label so the dropdown matches Detected characters.
      canonical_name: label,
      aliases: char.aliases ?? [],
      elevenlabs_voice_id: char.elevenlabs_voice_id,
      elevenlabs_voice_name: char.elevenlabs_voice_name,
    });
  }

  return roster.sort((a, b) =>
    a.canonical_name.localeCompare(b.canonical_name, undefined, {
      sensitivity: "base",
    })
  );
}
