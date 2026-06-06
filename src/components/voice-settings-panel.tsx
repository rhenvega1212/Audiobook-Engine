"use client";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  DEFAULT_VOICE_SETTINGS,
  mergeVoiceSettings,
  VOICE_SETTINGS_PRESETS,
  type VoiceSettings,
} from "@/lib/elevenlabs/voice-settings";

export function VoiceSettingsPanel({
  settings,
  onChange,
}: {
  settings: VoiceSettings;
  onChange: (settings: VoiceSettings) => void;
}) {
  const current = mergeVoiceSettings(settings, {});

  function patch(partial: Partial<VoiceSettings>) {
    onChange({ ...current, ...partial });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border-muted/60 bg-warm-sand/40 p-4">
      <div>
        <p className="text-body-sm font-medium text-ink">Voice tuning</p>
        <p className="text-[11px] text-slate mt-0.5">
          Applied per character at preview and playback — does not change the
          ElevenLabs voice globally.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {VOICE_SETTINGS_PRESETS.map((preset) => (
          <Button
            key={preset.id}
            type="button"
            variant="secondary"
            size="sm"
            className="h-8 text-xs"
            title={preset.description}
            onClick={() => onChange(preset.settings)}
          >
            {preset.label}
          </Button>
        ))}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-8 text-xs"
          onClick={() => onChange({})}
        >
          Reset
        </Button>
      </div>

      <Slider
        id="voice-stability"
        label="Stability"
        hint="Higher = more consistent; lower = more expressive variation"
        min={0}
        max={1}
        value={current.stability ?? DEFAULT_VOICE_SETTINGS.stability}
        onChange={(v) => patch({ stability: v })}
      />
      <Slider
        id="voice-similarity"
        label="Similarity boost"
        hint="How closely output matches the original voice sample"
        min={0}
        max={1}
        value={current.similarity_boost ?? DEFAULT_VOICE_SETTINGS.similarity_boost}
        onChange={(v) => patch({ similarity_boost: v })}
      />
      <Slider
        id="voice-style"
        label="Style exaggeration"
        hint="Amplifies the voice's natural style (when supported by model)"
        min={0}
        max={1}
        value={current.style ?? DEFAULT_VOICE_SETTINGS.style}
        onChange={(v) => patch({ style: v })}
      />
      <Slider
        id="voice-speed"
        label="Speed"
        min={0.5}
        max={2}
        step={0.05}
        value={current.speed ?? DEFAULT_VOICE_SETTINGS.speed}
        onChange={(v) => patch({ speed: v })}
      />
    </div>
  );
}
