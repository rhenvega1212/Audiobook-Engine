import type { VoiceSettings } from "@/lib/elevenlabs/voice-settings";
import { normalizeVoiceSettings } from "@/lib/elevenlabs/voice-settings";

let activeAudio: HTMLAudioElement | null = null;
let activeObjectUrl: string | null = null;
let playGeneration = 0;

export function stopVoicePreview() {
  playGeneration++;
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio.onended = null;
    activeAudio = null;
  }
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = null;
  }
}

export type VoicePreviewOptions = {
  voiceId?: string;
  name?: string;
  previewUrl?: string;
  text?: string;
  language_code?: string | null;
  voice_settings?: VoiceSettings | null;
  onStart?: () => void;
  onEnd?: () => void;
};

export async function playVoicePreview(
  options: VoicePreviewOptions
): Promise<boolean> {
  stopVoicePreview();
  const generation = playGeneration;

  try {
    let src: string;

    if (options.previewUrl) {
      src = options.previewUrl;
    } else if (options.voiceId) {
      const text =
        options.text ?? `Hello, I'm ${options.name ?? "there"}.`;
      const settings = normalizeVoiceSettings(options.voice_settings);
      const res = await fetch("/api/voices/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voice_id: options.voiceId,
          text,
          ...(options.language_code
            ? { language_code: options.language_code }
            : {}),
          ...(settings ? { voice_settings: settings } : {}),
        }),
      });
      if (generation !== playGeneration) return false;
      if (!res.ok) throw new Error("Preview failed");
      const blob = await res.blob();
      if (generation !== playGeneration) return false;
      src = URL.createObjectURL(blob);
      activeObjectUrl = src;
    } else {
      return false;
    }

    if (generation !== playGeneration) return false;

    const audio = new Audio(src);
    activeAudio = audio;
    options.onStart?.();
    audio.onended = () => {
      if (generation !== playGeneration) return;
      stopVoicePreview();
      options.onEnd?.();
    };
    await audio.play();
    if (generation !== playGeneration) {
      stopVoicePreview();
      return false;
    }
    return true;
  } catch {
    if (generation === playGeneration) {
      stopVoicePreview();
      options.onEnd?.();
    }
    return false;
  }
}
