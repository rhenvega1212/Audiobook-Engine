import { VOICE_LIBRARY_ACCENTS } from "@/lib/elevenlabs/voice-library-filters";

export type VerifiedVoiceLanguage = {
  language: string;
  model_id: string;
  accent: string | null;
  locale: string | null;
  preview_url: string | null;
};

export type AccentOption = {
  key: string;
  language: string;
  accent: string | null;
  locale: string | null;
  preview_url: string | null;
};

export function formatAccentLabel(accent: string | null | undefined): string {
  if (!accent?.trim()) return "Standard";
  const found = VOICE_LIBRARY_ACCENTS.find(
    (a) => a.value.toLowerCase() === accent.toLowerCase()
  );
  if (found) return found.label;
  return accent
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function formatAccentOptionLabel(option: AccentOption): string {
  const accent = formatAccentLabel(option.accent);
  const locale = option.locale?.trim();
  if (locale && locale !== option.accent) {
    return `${accent} (${locale})`;
  }
  return accent;
}

/** Deduplicate verified_languages by language + accent + locale. */
export function accentOptionsFromVerifiedLanguages(
  languages: VerifiedVoiceLanguage[] | null | undefined
): AccentOption[] {
  if (!languages?.length) return [];
  const seen = new Map<string, AccentOption>();
  for (const vl of languages) {
    const key = `${vl.language}|${vl.accent ?? ""}|${vl.locale ?? ""}`;
    if (seen.has(key)) continue;
    seen.set(key, {
      key,
      language: vl.language,
      accent: vl.accent,
      locale: vl.locale,
      preview_url: vl.preview_url,
    });
  }
  return [...seen.values()].sort((a, b) =>
    formatAccentOptionLabel(a).localeCompare(formatAccentOptionLabel(b))
  );
}

/** Extract a searchable base name from a voice label (e.g. "Michel – Global Voices"). */
export function voiceBaseName(voiceName: string): string {
  const part = voiceName.split(/[–\-—|]/)[0]?.trim();
  if (!part) return voiceName.trim();
  const words = part.split(/\s+/).filter(Boolean);
  if (words.length <= 2) return part;
  return words.slice(0, 2).join(" ");
}

export function accentOptionMatchesSelection(
  option: AccentOption,
  selection: {
    voice_accent?: string | null;
    voice_locale?: string | null;
    voice_language?: string | null;
  }
): boolean {
  const lang = selection.voice_language ?? "en";
  const accent = selection.voice_accent ?? null;
  const locale = selection.voice_locale ?? null;
  return (
    option.language === lang &&
    (option.accent ?? null) === accent &&
    (option.locale ?? null) === locale
  );
}
