-- Per-character voice tuning and accent/locale for ElevenLabs generation.
alter table characters
  add column if not exists voice_accent text,
  add column if not exists voice_locale text,
  add column if not exists voice_language text,
  add column if not exists voice_settings jsonb;

comment on column characters.voice_accent is 'ElevenLabs accent label (e.g. spanish, french) for this character performance';
comment on column characters.voice_locale is 'BCP-47 locale when supported (e.g. en-US, fr-FR)';
comment on column characters.voice_language is 'ISO 639-1 language code passed to TTS as language_code';
comment on column characters.voice_settings is 'Per-request ElevenLabs voice_settings overrides (stability, similarity_boost, style, speed)';
