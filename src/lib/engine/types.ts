export type CharacterGender = "male" | "female" | "unknown";

export interface EngineCharacter {
  canonical_name: string;
  aliases: string[];
  gender: CharacterGender;
  matches(name: string): boolean;
}

export function createEngineCharacter(
  canonical_name: string,
  aliases: string[] = [],
  gender: CharacterGender = "unknown"
): EngineCharacter {
  return {
    canonical_name,
    aliases,
    gender,
    matches(name: string) {
      const nameLower = name.toLowerCase().trim();
      if (nameLower === canonical_name.toLowerCase()) return true;
      return aliases.some((a) => a.toLowerCase() === nameLower);
    },
  };
}

export interface TaggedLine {
  speaker: string;
  line: string;
  paragraph_num: number;
  confidence: "high" | "medium" | "low" | "none";
  flag_reason: string | null;
}

export interface ProcessResult {
  lines: TaggedLine[];
  unknown_speakers: string[];
  total_paragraphs: number;
  total_lines: number;
  flagged_count: number;
}
