import { z } from "zod";

export const penNameSchema = z.object({
  name: z.string().min(1).max(200),
});

export const seriesSchema = z.object({
  pen_name_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
});

export const characterRoleSchema = z.enum([
  "narrator",
  "protagonist",
  "series_regular",
  "recurring",
  "guest",
]);

export const characterSchema = z.object({
  series_id: z.string().uuid(),
  canonical_name: z.string().min(1).max(200),
  aliases: z.array(z.string()).optional(),
  gender: z.enum(["male", "female", "unknown"]).optional(),
  role: characterRoleSchema.optional(),
  description: z.string().max(1000).optional().nullable(),
});

const voiceSettingsSchema = z.object({
  stability: z.number().min(0).max(1).optional(),
  similarity_boost: z.number().min(0).max(1).optional(),
  style: z.number().min(0).max(1).optional(),
  speed: z.number().min(0.5).max(2).optional(),
  use_speaker_boost: z.boolean().optional(),
});

export const characterPatchSchema = z.object({
  canonical_name: z.string().min(1).max(200).optional(),
  aliases: z.array(z.string()).optional(),
  gender: z.enum(["male", "female", "unknown"]).optional(),
  role: characterRoleSchema.optional(),
  elevenlabs_voice_id: z.string().nullable().optional(),
  elevenlabs_voice_name: z.string().nullable().optional(),
  voice_style: z.string().nullable().optional(),
  voice_accent: z.string().nullable().optional(),
  voice_locale: z.string().nullable().optional(),
  voice_language: z.string().nullable().optional(),
  voice_settings: voiceSettingsSchema.nullable().optional(),
  voice_notes: z.string().nullable().optional(),
});

export const bookCreateSchema = z.object({
  series_id: z.string().uuid(),
  title: z.string().min(1).max(300),
});

export const lineUpdateSchema = z.object({
  speaker_character_id: z.string().uuid().nullable().optional(),
  speaker_label: z.string().min(1).optional(),
  human_reviewed: z.boolean().optional(),
  spoken_text: z.string().nullable().optional(),
  flag_reason: z.string().nullable().optional(),
  excluded_from_export: z.boolean().optional(),
  line_text: z.string().min(1).optional(),
});

export const lineBulkUpdateSchema = z.object({
  line_ids: z.array(z.string().uuid()).min(1).max(500),
  speaker_character_id: z.string().uuid().nullable().optional(),
  speaker_label: z.string().min(1).optional(),
  excluded_from_export: z.boolean().optional(),
  flag_reason: z.string().nullable().optional(),
  human_reviewed: z.boolean().optional(),
});

export const lineSplitSchema = z.object({
  line_id: z.string().uuid(),
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  speaker_character_id: z.string().uuid().nullable(),
  speaker_label: z.string().min(1),
  /** Prepend trailing quoted dialogue to the next line instead of creating a new row. */
  merge_trailing_into_next: z.boolean().optional(),
  /** When merging trailing dialogue, optionally reassign the next line's speaker. */
  trailing_speaker_character_id: z.string().uuid().nullable().optional(),
  trailing_speaker_label: z.string().min(1).optional(),
});

export const lineMergeSchema = z.object({
  line_ids: z.array(z.string().uuid()).min(2).max(100),
});

export const lineDeleteSchema = z.object({
  line_ids: z.array(z.string().uuid()).min(1).max(500),
});

export const lineEditParagraphSchema = z.object({
  line_ids: z.array(z.string().uuid()).min(1).max(500),
  text: z.string().max(20000),
});

export const lineReorderSchema = z.object({
  line_id: z.string().uuid(),
  target_line_order: z.number().int().min(0),
});

export const pronunciationSchema = z.object({
  series_id: z.string().uuid(),
  word: z.string().min(1).max(200),
  spoken_form: z.string().min(1).max(500),
  notes: z.string().max(500).optional().nullable(),
});

export const adminCreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const adminUpdatePasswordSchema = z.object({
  password: z.string().min(8).max(128),
});

export const pronunciationPatchSchema = z.object({
  word: z.string().min(1).max(200).optional(),
  spoken_form: z.string().min(1).max(500).optional(),
  notes: z.string().max(500).optional().nullable(),
});
