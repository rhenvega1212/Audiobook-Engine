"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Loader2, Play, Star } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Character } from "@/lib/types/database";
import {
  getRecommendedVoiceId,
  type ElevenVoice,
  type VoiceAssignment,
  voiceSharedWithOtherCharacter,
} from "@/lib/elevenlabs/voice-picker-utils";
import { VoiceBrowser } from "@/components/voice-browser";
import { VoiceSettingsPanel } from "@/components/voice-settings-panel";
import {
  VoiceAccentSection,
  type AccentSelection,
} from "@/components/voice-accent-section";
import {
  playVoicePreview,
  stopVoicePreview,
} from "@/lib/elevenlabs/voice-preview-player";
import {
  accentOptionsFromVerifiedLanguages,
  type AccentOption,
} from "@/lib/elevenlabs/voice-accents";
import {
  mergeVoiceSettings,
  normalizeVoiceSettings,
  type VoiceSettings,
} from "@/lib/elevenlabs/voice-settings";

export function VoicePickerDialog({
  character,
  sampleLines,
  open,
  onOpenChange,
  onSaved,
  assignedVoices,
}: {
  character: Character;
  sampleLines: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  assignedVoices?: VoiceAssignment[];
}) {
  const [voices, setVoices] = useState<ElevenVoice[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(
    character.elevenlabs_voice_id
  );
  const [selectedName, setSelectedName] = useState<string | null>(
    character.elevenlabs_voice_name
  );
  const [style, setStyle] = useState(character.voice_style ?? "");
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(
    mergeVoiceSettings(character.voice_settings ?? {}, {})
  );
  const [accentSelection, setAccentSelection] = useState<AccentSelection>({
    voice_accent: character.voice_accent,
    voice_locale: character.voice_locale,
    voice_language: character.voice_language,
  });
  const [accentOptions, setAccentOptions] = useState<AccentOption[]>([]);
  const [defaultAccent, setDefaultAccent] = useState<AccentOption | null>(
    null
  );
  const [detailLoading, setDetailLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      stopVoicePreview();
      setPlaying(false);
      return;
    }
    setSelectedId(character.elevenlabs_voice_id);
    setSelectedName(character.elevenlabs_voice_name);
    setStyle(character.voice_style ?? "");
    setVoiceSettings(mergeVoiceSettings(character.voice_settings ?? {}, {}));
    setAccentSelection({
      voice_accent: character.voice_accent,
      voice_locale: character.voice_locale,
      voice_language: character.voice_language,
    });
    setShowAdvanced(
      Boolean(
        character.voice_settings ||
          character.voice_accent ||
          character.voice_locale
      )
    );
  }, [open, character]);

  useEffect(() => () => stopVoicePreview(), []);

  useEffect(() => {
    if (!open || !selectedId) {
      setAccentOptions([]);
      setDefaultAccent(null);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    fetch(`/api/voices/${selectedId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load voice details");
        return res.json();
      })
      .then((detail) => {
        if (cancelled) return;
        const options = accentOptionsFromVerifiedLanguages(
          detail.accent_options ?? detail.verified_languages
        );
        setAccentOptions(options);
        const labels = detail.labels ?? {};
        const fallback: AccentOption | null =
          labels.accent || labels.locale || labels.language
            ? {
                key: "labels",
                language: labels.language ?? "en",
                accent: labels.accent ?? null,
                locale: labels.locale ?? null,
                preview_url: null,
              }
            : options[0] ?? null;
        setDefaultAccent(fallback);

        const sameVoice = selectedId === character.elevenlabs_voice_id;
        if (!sameVoice) {
          if (fallback) {
            setAccentSelection({
              voice_accent: fallback.accent,
              voice_locale: fallback.locale,
              voice_language: fallback.language,
            });
          } else {
            setAccentSelection({
              voice_accent: null,
              voice_locale: null,
              voice_language: null,
            });
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAccentOptions([]);
          setDefaultAccent(null);
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, selectedId, character.elevenlabs_voice_id]);

  const recommendedId = useMemo(
    () => getRecommendedVoiceId(character, voices),
    [character, voices]
  );

  const selectedVoiceName = useMemo(() => {
    if (selectedName) return selectedName;
    return voices.find((v) => v.voice_id === selectedId)?.name ?? null;
  }, [selectedName, selectedId, voices]);

  function handleSelectVoice(voiceId: string) {
    setSelectedId(voiceId);
    const voice = voices.find((v) => v.voice_id === voiceId);
    setSelectedName(voice?.name ?? null);
  }

  function handleVoiceReplaced(voice: {
    voice_id: string;
    voice_name: string;
    voice_accent: string | null;
    voice_locale: string | null;
    voice_language: string | null;
  }) {
    setSelectedId(voice.voice_id);
    setSelectedName(voice.voice_name);
    setAccentSelection({
      voice_accent: voice.voice_accent,
      voice_locale: voice.voice_locale,
      voice_language: voice.voice_language,
    });
    setVoices((prev) => {
      if (prev.some((v) => v.voice_id === voice.voice_id)) return prev;
      return [
        ...prev,
        { voice_id: voice.voice_id, name: voice.voice_name },
      ];
    });
  }

  async function playSample() {
    if (!selectedId) return;
    const text =
      sampleLines[0]?.slice(0, 200) ||
      `Hello, I am ${character.canonical_name}.`;
    setPlaying(true);
    const ok = await playVoicePreview({
      voiceId: selectedId,
      text,
      language_code: accentSelection.voice_language,
      voice_settings: voiceSettings,
      onEnd: () => setPlaying(false),
    });
    if (!ok) {
      setPlaying(false);
      toast.error("Could not play preview");
    }
  }

  async function handleSave() {
    if (!selectedId) return;
    const shared = voiceSharedWithOtherCharacter(
      selectedId,
      character.id,
      assignedVoices
    );
    if (shared) {
      toast.message(
        `${shared.character_name} also uses this voice — style and tuning will differentiate ${character.canonical_name}.`
      );
    }
    const voice = voices.find((v) => v.voice_id === selectedId);
    const settings = normalizeVoiceSettings(voiceSettings);
    setLoading(true);
    const res = await fetch(`/api/characters/${character.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        elevenlabs_voice_id: selectedId,
        elevenlabs_voice_name: selectedName ?? voice?.name ?? null,
        voice_style: style || null,
        voice_accent: accentSelection.voice_accent,
        voice_locale: accentSelection.voice_locale,
        voice_language: accentSelection.voice_language,
        voice_settings: settings,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      toast.error("Failed to save voice");
      return;
    }
    toast.success(`Cast ${character.canonical_name}`);
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] top-[3vh] translate-y-0 overflow-hidden flex flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 mx-0 mt-0 mb-0 rounded-t-lg pr-12">
          <DialogTitle>Cast voice — {character.canonical_name}</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-6 pb-6 pt-4">
          {sampleLines.length > 0 ? (
            <div className="shrink-0 max-h-36 overflow-y-auto rounded-lg border border-border-muted/60 bg-warm-sand p-4 space-y-2">
              {sampleLines.map((line, i) => (
                <p
                  key={i}
                  className="font-serif text-sm italic text-ink break-words leading-relaxed"
                >
                  &ldquo;{line}&rdquo;
                </p>
              ))}
            </div>
          ) : (
            <p className="shrink-0 text-body-sm text-slate">
              Search your voices or browse the ElevenLabs library to import new
              ones.
            </p>
          )}

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {recommendedId &&
              !voiceSharedWithOtherCharacter(
                recommendedId,
                character.id,
                assignedVoices
              ) && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => handleSelectVoice(recommendedId)}
                >
                  <Star className="h-3 w-3 mr-1" />
                  Use recommended
                </Button>
              )}
            {selectedId && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={playSample}
                disabled={playing}
              >
                {playing ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Play className="h-3 w-3 mr-1" />
                )}
                Preview with settings
              </Button>
            )}
            {detailLoading ? (
              <span className="text-[11px] text-slate flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading voice details…
              </span>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto space-y-3 pr-1">
            <VoiceBrowser
              selectedId={selectedId}
              onSelect={handleSelectVoice}
              onVoicesChange={setVoices}
              genderDefault={
                character.gender === "unknown" ? "all" : character.gender
              }
              compact
              embedded
              currentCharacterId={character.id}
              assignedVoices={assignedVoices}
            />

            <div>
              <Label htmlFor="style">Style descriptor</Label>
              <Input
                id="style"
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                placeholder="Elegant & Lovely, Dark and Tough…"
              />
              <p className="text-[11px] text-slate mt-1">
                Notes for your team — pair with tuning below for distinct
                performances on the same voice.
              </p>
            </div>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full justify-between"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              Accent & voice tuning
              {showAdvanced ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>

            {showAdvanced ? (
              <div className="space-y-3">
                <VoiceAccentSection
                  voiceId={selectedId}
                  voiceName={selectedVoiceName}
                  characterName={character.canonical_name}
                  gender={character.gender}
                  accentOptions={accentOptions}
                  defaultAccent={defaultAccent}
                  selection={accentSelection}
                  onSelectionChange={setAccentSelection}
                  onVoiceReplaced={handleVoiceReplaced}
                />
                <VoiceSettingsPanel
                  settings={voiceSettings}
                  onChange={setVoiceSettings}
                />
              </div>
            ) : null}

            <Button
              onClick={handleSave}
              disabled={!selectedId || loading}
              className="w-full sm:w-auto sm:self-end"
            >
              Cast as {character.canonical_name}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
