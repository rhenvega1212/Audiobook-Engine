import type { VoiceCastConfig } from "@/lib/elevenlabs/voice-cast";

/** Line row shape for manuscript studio (server + client). */
export type ManuscriptLine = {
  id: string;
  line_order: number;
  paragraph_num: number;
  speaker_label: string;
  speaker_character_id: string | null;
  line_text: string;
  flag_reason: string | null;
  human_reviewed?: boolean;
  excluded_from_export: boolean;
  voice_id: string | null;
  voice_name: string | null;
  voice_playback?: Omit<VoiceCastConfig, "voice_id"> | null;
};
