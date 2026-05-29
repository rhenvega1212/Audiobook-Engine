export type BookStatus =
  | "uploaded"
  | "analyzing"
  | "needs_casting"
  | "ready_for_review"
  | "reviewing"
  | "ready_for_export"
  | "exported";

export type PenName = {
  id: string;
  name: string;
  created_at: string;
};

export type Series = {
  id: string;
  pen_name_id: string;
  name: string;
  description: string | null;
  created_at: string;
  pen_names?: { name: string };
};

export type CharacterRole =
  | "narrator"
  | "protagonist"
  | "series_regular"
  | "recurring"
  | "guest";

export type Character = {
  id: string;
  series_id: string;
  canonical_name: string;
  aliases: string[];
  gender: "male" | "female" | "unknown";
  role: CharacterRole;
  description: string | null;
  elevenlabs_voice_id: string | null;
  elevenlabs_voice_name: string | null;
  voice_style: string | null;
  voice_notes: string | null;
  created_at: string;
  updated_at: string;
  series?: Series;
};

export type Book = {
  id: string;
  series_id: string;
  title: string;
  manuscript_path: string | null;
  status: BookStatus;
  ai_budget_usd?: number;
  ai_spend_usd?: number;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
  series?: Series;
};

export type TaggedLine = {
  id: string;
  book_id: string;
  line_order: number;
  paragraph_num: number;
  speaker_character_id: string | null;
  speaker_label: string;
  line_text: string;
  spoken_text: string | null;
  confidence: "high" | "medium" | "low" | "none" | null;
  flag_reason: string | null;
  ai_reviewed: boolean;
  human_reviewed: boolean;
  excluded_from_export: boolean;
  created_at: string;
};

export type Pronunciation = {
  id: string;
  series_id: string;
  word: string;
  spoken_form: string;
  notes: string | null;
  created_at: string;
};
