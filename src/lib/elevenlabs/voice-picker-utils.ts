import { matchElevenLabsVoice } from "@/lib/elevenlabs/match-voice";
import type { Character } from "@/lib/types/database";

export type ElevenVoice = {
  voice_id: string;
  name: string;
  labels?: Record<string, string>;
};

/** Another character in the series already using this ElevenLabs voice. */
export type VoiceAssignment = {
  voice_id: string;
  character_id: string;
  character_name: string;
};

export function voiceAssignmentsFromCharacters(
  characters: Pick<
    Character,
    "id" | "canonical_name" | "elevenlabs_voice_id"
  >[]
): VoiceAssignment[] {
  return characters
    .filter((c) => c.elevenlabs_voice_id)
    .map((c) => ({
      voice_id: c.elevenlabs_voice_id!,
      character_id: c.id,
      character_name: c.canonical_name,
    }));
}

export function voiceUsedByOtherCharacter(
  voiceId: string,
  currentCharacterId: string,
  assigned: VoiceAssignment[] | undefined
): VoiceAssignment | undefined {
  return voiceSharedWithOtherCharacter(voiceId, currentCharacterId, assigned);
}

/** Same voice on multiple characters is allowed (e.g. Derek & Marty both use Adam). */
export function voiceSharedWithOtherCharacter(
  voiceId: string,
  currentCharacterId: string,
  assigned: VoiceAssignment[] | undefined
): VoiceAssignment | undefined {
  if (!assigned?.length) return undefined;
  return assigned.find(
    (a) => a.voice_id === voiceId && a.character_id !== currentCharacterId
  );
}

export function getRecommendedVoiceId(
  character: Character,
  voices: ElevenVoice[]
): string | null {
  const hint = character.elevenlabs_voice_name;
  if (!hint) return null;
  const match = matchElevenLabsVoice(hint, voices, character.voice_style);
  return match?.voice_id ?? null;
}

export function sortVoicesForCharacter(
  voices: ElevenVoice[],
  character: Character
): ElevenVoice[] {
  const recommendedId = getRecommendedVoiceId(character, voices);
  const gender = character.gender;

  return [...voices].sort((a, b) => {
    if (a.voice_id === recommendedId) return -1;
    if (b.voice_id === recommendedId) return 1;

    const aGender = a.labels?.gender?.toLowerCase() ?? "";
    const bGender = b.labels?.gender?.toLowerCase() ?? "";
    if (gender === "female") {
      if (aGender === "female" && bGender !== "female") return -1;
      if (bGender === "female" && aGender !== "female") return 1;
    }
    if (gender === "male") {
      if (aGender === "male" && bGender !== "male") return -1;
      if (bGender === "male" && aGender !== "male") return 1;
    }
    return a.name.localeCompare(b.name);
  });
}

export function filterVoicesByGender(
  voices: ElevenVoice[],
  gender: "all" | "male" | "female"
): ElevenVoice[] {
  if (gender === "all") return voices;
  return voices.filter((v) => {
    const g = v.labels?.gender?.toLowerCase();
    if (!g) return true;
    return g === gender;
  });
}
