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

export async function searchSharedVoices(options: {
  search?: string;
  gender?: string;
  page_size?: number;
  page?: number;
}): Promise<{ voices: SharedVoice[]; has_more: boolean; total_count: number }> {
  const apiKey = getElevenLabsApiKey();
  const params = new URLSearchParams({
    page_size: String(options.page_size ?? 30),
    page: String(options.page ?? 0),
  });
  if (options.search?.trim()) params.set("search", options.search.trim());
  if (options.gender && options.gender !== "all") {
    params.set("gender", options.gender);
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

export async function synthesizeSpeech(
  voiceId: string,
  text: string
): Promise<ArrayBuffer> {
  const apiKey = getElevenLabsApiKey();
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "Text-to-speech failed");
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
