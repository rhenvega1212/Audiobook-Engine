import type { Character } from "@/lib/types/database";
import { formatAccentLabel } from "@/lib/elevenlabs/voice-accents";
import {
  normalizeVoiceSettings,
  type VoiceSettings,
} from "@/lib/elevenlabs/voice-settings";

export type VoiceCastConfig = {
  voice_id: string;
  language_code?: string;
  voice_settings?: VoiceSettings;
};

export type VoicePreviewPayload = VoiceCastConfig & {
  text: string;
};

export function voiceCastFromCharacter(
  char: Pick<
    Character,
    "elevenlabs_voice_id" | "voice_language" | "voice_settings"
  >
): VoiceCastConfig | null {
  if (!char.elevenlabs_voice_id) return null;
  const settings = normalizeVoiceSettings(char.voice_settings);
  return {
    voice_id: char.elevenlabs_voice_id,
    ...(char.voice_language ? { language_code: char.voice_language } : {}),
    ...(settings ? { voice_settings: settings } : {}),
  };
}

export function voicePlaybackFromCharacter(
  char: Pick<Character, "voice_language" | "voice_settings"> | null | undefined
): Omit<VoiceCastConfig, "voice_id"> | null {
  if (!char) return null;
  const settings = normalizeVoiceSettings(char.voice_settings);
  if (!char.voice_language && !settings) return null;
  return {
    ...(char.voice_language ? { language_code: char.voice_language } : {}),
    ...(settings ? { voice_settings: settings } : {}),
  };
}

export function voicePreviewPayload(
  char: Pick<
    Character,
    "elevenlabs_voice_id" | "voice_language" | "voice_settings"
  >,
  text: string
): VoicePreviewPayload | null {
  const cast = voiceCastFromCharacter(char);
  if (!cast) return null;
  return { ...cast, text };
}

export function formatVoiceCastSummary(
  char: Pick<
    Character,
    | "elevenlabs_voice_name"
    | "voice_style"
    | "voice_accent"
    | "voice_locale"
  >
): string {
  const parts: string[] = [];
  if (char.elevenlabs_voice_name) parts.push(char.elevenlabs_voice_name);
  if (char.voice_accent) parts.push(formatAccentLabel(char.voice_accent));
  if (char.voice_style) parts.push(char.voice_style);
  if (char.voice_locale && !char.voice_accent) parts.push(char.voice_locale);
  return parts.join(" · ") || "—";
}
