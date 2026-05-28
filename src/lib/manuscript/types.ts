/** Line row shape for manuscript studio (server + client). */
export type ManuscriptLine = {
  id: string;
  line_order: number;
  speaker_label: string;
  speaker_character_id: string | null;
  line_text: string;
  flag_reason: string | null;
  excluded_from_export: boolean;
  voice_id: string | null;
  voice_name: string | null;
};
