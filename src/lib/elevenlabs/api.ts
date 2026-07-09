import type { VerifiedVoiceLanguage } from "@/lib/elevenlabs/voice-accents";
import type { VoiceSettings } from "@/lib/elevenlabs/voice-settings";
import { normalizeVoiceSettings } from "@/lib/elevenlabs/voice-settings";
import { voiceBaseName } from "@/lib/elevenlabs/voice-accents";

export type ElevenVoice = {
  voice_id: string;
  name: string;
  labels?: Record<string, string>;
  category?: string;
};

export type SharedVoice = {
  voice_id: string;
  name: string;
  public_owner_id: string;
  labels?: Record<string, string>;
  accent?: string;
  gender?: string;
  age?: string;
  descriptive?: string;
  preview_url?: string;
  language?: string;
  locale?: string;
};

export type VoiceDetail = {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
  verified_languages?: VerifiedVoiceLanguage[];
};

export type SynthesizeSpeechOptions = {
  language_code?: string | null;
  voice_settings?: VoiceSettings | null;
  model_id?: string;
  /** ElevenLabs output format, e.g. "mp3_44100_128". Defaults to API default MP3. */
  output_format?: string;
};

export function getElevenLabsApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY not configured");
  return key;
}

export async function fetchMyVoices(search?: string): Promise<ElevenVoice[]> {
  const apiKey = getElevenLabsApiKey();
  const params = new URLSearchParams({ page_size: "100" });
  if (search?.trim()) params.set("search", search.trim());

  const res = await fetch(
    `https://api.elevenlabs.io/v2/voices?${params.toString()}`,
    { headers: { "xi-api-key": apiKey } }
  );

  if (!res.ok) {
    const fallback = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": apiKey },
    });
    if (!fallback.ok) throw new Error("Failed to fetch voices from ElevenLabs");
    const data = await fallback.json();
    const voices: ElevenVoice[] = data.voices ?? [];
    if (!search?.trim()) return voices;
    const q = search.toLowerCase();
    return voices.filter((v) => v.name.toLowerCase().includes(q));
  }

  const data = await res.json();
  return (data.voices ?? []).map(
    (v: { voice_id: string; name: string; labels?: Record<string, string> }) => ({
      voice_id: v.voice_id,
      name: v.name,
      labels: v.labels,
    })
  );
}

export async function fetchVoiceDetail(voiceId: string): Promise<VoiceDetail> {
  const apiKey = getElevenLabsApiKey();
  const res = await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
    headers: { "xi-api-key": apiKey },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "Failed to fetch voice details");
  }
  const data = await res.json();
  return {
    voice_id: data.voice_id ?? voiceId,
    name: data.name ?? "Unknown voice",
    category: data.category,
    labels: data.labels,
    verified_languages: data.verified_languages ?? [],
  };
}

export async function searchSharedVoices(options: {
  search?: string;
  gender?: string;
  age?: string;
  language?: string;
  accent?: string;
  page_size?: number;
  page?: number;
}): Promise<{ voices: SharedVoice[]; has_more: boolean; total_count: number }> {
  const apiKey = getElevenLabsApiKey();
  const params = new URLSearchParams({
    page_size: String(Math.min(options.page_size ?? 100, 100)),
    page: String(options.page ?? 0),
  });
  if (options.search?.trim()) params.set("search", options.search.trim());
  if (options.gender && options.gender !== "all") {
    params.set("gender", options.gender);
  }
  if (options.age && options.age !== "all") {
    params.set("age", options.age);
  }
  if (options.language && options.language !== "all") {
    params.set("language", options.language);
  }
  if (options.accent && options.accent !== "all") {
    params.set("accent", options.accent);
  }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/shared-voices?${params.toString()}`,
    { headers: { "xi-api-key": apiKey } }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "Failed to search ElevenLabs voice library");
  }

  const data = await res.json();
  return {
    voices: data.voices ?? [],
    has_more: data.has_more ?? false,
    total_count: data.total_count ?? 0,
  };
}

/** Find library voices with the same base name but a different accent. */
export async function searchAccentVariants(options: {
  voiceName: string;
  targetAccent: string;
  gender?: string;
}): Promise<SharedVoice[]> {
  const base = voiceBaseName(options.voiceName);
  const firstToken = base.split(/\s+/)[0]?.toLowerCase() ?? base.toLowerCase();
  const { voices } = await searchSharedVoices({
    search: firstToken,
    accent: options.targetAccent,
    gender: options.gender,
    page_size: 30,
  });
  return voices.filter((v) => {
    const name = v.name.toLowerCase();
    return (
      name.includes(firstToken) ||
      name.startsWith(base.toLowerCase().slice(0, Math.min(base.length, 8)))
    );
  });
}

export async function importSharedVoice(
  publicUserId: string,
  voiceId: string,
  newName: string
): Promise<{ voice_id: string; name: string }> {
  const apiKey = getElevenLabsApiKey();
  const res = await fetch(
    `https://api.elevenlabs.io/v1/voices/add/${publicUserId}/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ new_name: newName }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "Failed to import voice");
  }

  const data = await res.json();
  return {
    voice_id: data.voice_id ?? voiceId,
    name: newName,
  };
}

export async function remixVoiceAccent(
  voiceId: string,
  voiceDescription: string
): Promise<{ generated_voice_id: string; audio_base64?: string }> {
  const apiKey = getElevenLabsApiKey();
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-voice/${voiceId}/remix`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        voice_description: voiceDescription,
        auto_generate_text: true,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "Voice remix failed");
  }

  const data = await res.json();
  const preview = data.previews?.[0] ?? data.voice_previews?.[0];
  if (!preview?.generated_voice_id) {
    throw new Error("Remix did not return a voice preview");
  }
  return {
    generated_voice_id: preview.generated_voice_id,
    audio_base64: preview.audio_base_64 ?? preview.audio_base64,
  };
}

export async function createVoiceFromRemixPreview(options: {
  generated_voice_id: string;
  voice_name: string;
  voice_description: string;
  labels?: Record<string, string>;
}): Promise<{ voice_id: string; name: string }> {
  const apiKey = getElevenLabsApiKey();
  const res = await fetch("https://api.elevenlabs.io/v1/text-to-voice", {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      voice_name: options.voice_name,
      voice_description: options.voice_description,
      generated_voice_id: options.generated_voice_id,
      labels: options.labels,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "Failed to save remixed voice");
  }

  const data = await res.json();
  return {
    voice_id: data.voice_id,
    name: options.voice_name,
  };
}

/** Error carrying the HTTP status so callers can back off on 429 / 5xx. */
export class ElevenLabsRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ElevenLabsRequestError";
    this.status = status;
  }
}

export async function synthesizeSpeech(
  voiceId: string,
  text: string,
  options: SynthesizeSpeechOptions = {}
): Promise<ArrayBuffer> {
  const apiKey = getElevenLabsApiKey();
  const settings = normalizeVoiceSettings(options.voice_settings);
  const body: Record<string, unknown> = {
    text,
    model_id: options.model_id ?? "eleven_multilingual_v2",
  };
  if (options.language_code?.trim()) {
    body.language_code = options.language_code.trim();
  }
  if (settings) {
    body.voice_settings = settings;
  }

  const query = options.output_format
    ? `?output_format=${encodeURIComponent(options.output_format)}`
    : "";

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}${query}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    const status = res.status;
    throw new ElevenLabsRequestError(
      err || "Text-to-speech failed",
      status
    );
  }

  return res.arrayBuffer();
}

/** Convert a user recording into the target character voice (preserves cadence/emotion). */
export async function convertSpeechToSpeech(
  voiceId: string,
  audio: Blob,
  filename = "recording.webm"
): Promise<ArrayBuffer> {
  const apiKey = getElevenLabsApiKey();
  const form = new FormData();
  form.append("audio", audio, filename);
  form.append("model_id", "eleven_multilingual_sts_v2");
  form.append("file_format", "other");

  const res = await fetch(
    `https://api.elevenlabs.io/v1/speech-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "Voice conversion failed");
  }

  return res.arrayBuffer();
}
