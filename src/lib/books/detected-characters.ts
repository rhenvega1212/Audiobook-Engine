import { resolveMatchStatus, type DetectedCharacter } from "@/lib/characters/match-status";
import type { Character, TaggedLine } from "@/lib/types/database";

/**
 * Build per-book detected character stats from actual tagged lines only.
 * Avoids stale book_characters rows showing speakers with no lines.
 */
export function buildDetectedCharacters(
  lines: Pick<TaggedLine, "speaker_label" | "line_text">[],
  roster: Character[]
): DetectedCharacter[] {
  const detectedMap = new Map<string, { count: number; samples: string[] }>();

  for (const line of lines) {
    const label = line.speaker_label;
    if (label === "Narrator") continue;

    const entry = detectedMap.get(label) ?? { count: 0, samples: [] };
    entry.count += 1;
    if (entry.samples.length < 3 && line.line_text?.trim()) {
      entry.samples.push(line.line_text.slice(0, 120));
    }
    detectedMap.set(label, entry);
  }

  const detected_characters: DetectedCharacter[] = [];

  for (const [name, { count, samples }] of detectedMap) {
    const { status, character, suggestedAliasOf } = resolveMatchStatus(
      name,
      roster
    );
    detected_characters.push({
      name,
      line_count: count,
      sample_lines: samples,
      match_status: status,
      matched_character_id: character?.id ?? null,
      matched_character_name: character?.canonical_name ?? null,
      suggested_alias_of: suggestedAliasOf,
      voice_name: character?.elevenlabs_voice_name ?? null,
    });
  }

  detected_characters.sort((a, b) => b.line_count - a.line_count);
  return detected_characters;
}
