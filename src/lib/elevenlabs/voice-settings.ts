export type VoiceSettings = {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  speed?: number;
  use_speaker_boost?: boolean;
};

export const DEFAULT_VOICE_SETTINGS: Required<
  Pick<VoiceSettings, "stability" | "similarity_boost" | "style" | "speed">
> = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0,
  speed: 1,
};

export type VoiceSettingsPreset = {
  id: string;
  label: string;
  description: string;
  settings: VoiceSettings;
};

export const VOICE_SETTINGS_PRESETS: VoiceSettingsPreset[] = [
  {
    id: "natural",
    label: "Natural",
    description: "Balanced delivery for most dialogue",
    settings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0,
      speed: 1,
    },
  },
  {
    id: "expressive",
    label: "Expressive",
    description: "More variation and emotional range",
    settings: {
      stability: 0.35,
      similarity_boost: 0.8,
      style: 0.45,
      speed: 1,
    },
  },
  {
    id: "stable",
    label: "Stable narrator",
    description: "Consistent, steady read for narration",
    settings: {
      stability: 0.78,
      similarity_boost: 0.85,
      style: 0,
      speed: 0.98,
    },
  },
  {
    id: "firm",
    label: "Firm / dominant",
    description: "Lower variation, authoritative tone",
    settings: {
      stability: 0.62,
      similarity_boost: 0.88,
      style: 0.2,
      speed: 0.95,
    },
  },
];

export function normalizeVoiceSettings(
  raw: VoiceSettings | null | undefined
): VoiceSettings | null {
  if (!raw || typeof raw !== "object") return null;
  const out: VoiceSettings = {};
  if (typeof raw.stability === "number") out.stability = clamp(raw.stability, 0, 1);
  if (typeof raw.similarity_boost === "number") {
    out.similarity_boost = clamp(raw.similarity_boost, 0, 1);
  }
  if (typeof raw.style === "number") out.style = clamp(raw.style, 0, 1);
  if (typeof raw.speed === "number") out.speed = clamp(raw.speed, 0.5, 2);
  if (typeof raw.use_speaker_boost === "boolean") {
    out.use_speaker_boost = raw.use_speaker_boost;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function mergeVoiceSettings(
  base: VoiceSettings | null | undefined,
  preset: VoiceSettings
): VoiceSettings {
  return { ...DEFAULT_VOICE_SETTINGS, ...base, ...preset };
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
