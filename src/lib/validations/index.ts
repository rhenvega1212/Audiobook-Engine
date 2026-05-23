import { z } from "zod";

export const penNameSchema = z.object({
  name: z.string().min(1).max(200),
});

export const seriesSchema = z.object({
  pen_name_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
});

export const characterSchema = z.object({
  series_id: z.string().uuid(),
  canonical_name: z.string().min(1).max(200),
  aliases: z.array(z.string()).optional(),
  gender: z.enum(["male", "female", "unknown"]).optional(),
  description: z.string().max(1000).optional().nullable(),
});

export const characterPatchSchema = z.object({
  canonical_name: z.string().min(1).max(200).optional(),
  aliases: z.array(z.string()).optional(),
  gender: z.enum(["male", "female", "unknown"]).optional(),
  elevenlabs_voice_id: z.string().nullable().optional(),
  elevenlabs_voice_name: z.string().nullable().optional(),
  voice_style: z.string().nullable().optional(),
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
