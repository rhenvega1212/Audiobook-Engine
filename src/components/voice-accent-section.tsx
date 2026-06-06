"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Play, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableFilterSelect } from "@/components/ui/searchable-select";
import { VOICE_LIBRARY_ACCENTS } from "@/lib/elevenlabs/voice-library-filters";
import {
  accentOptionMatchesSelection,
  formatAccentLabel,
  formatAccentOptionLabel,
  type AccentOption,
} from "@/lib/elevenlabs/voice-accents";
import type { SharedVoice } from "@/lib/elevenlabs/api";
import {
  playVoicePreview,
  stopVoicePreview,
} from "@/lib/elevenlabs/voice-preview-player";

export type AccentSelection = {
  voice_accent: string | null;
  voice_locale: string | null;
  voice_language: string | null;
};

type AdaptVariant = SharedVoice & { importing?: boolean };

export function VoiceAccentSection({
  voiceId,
  voiceName,
  characterName,
  gender,
  accentOptions,
  defaultAccent,
  selection,
  onSelectionChange,
  onVoiceReplaced,
}: {
  voiceId: string | null;
  voiceName: string | null;
  characterName: string;
  gender?: string;
  accentOptions: AccentOption[];
  defaultAccent?: AccentOption | null;
  selection: AccentSelection;
  onSelectionChange: (selection: AccentSelection) => void;
  onVoiceReplaced: (voice: {
    voice_id: string;
    voice_name: string;
    voice_accent: string | null;
    voice_locale: string | null;
    voice_language: string | null;
  }) => void;
}) {
  const [showAdapt, setShowAdapt] = useState(false);
  const [targetAccent, setTargetAccent] = useState("french");
  const [searching, setSearching] = useState(false);
  const [remixing, setRemixing] = useState(false);
  const [variants, setVariants] = useState<AdaptVariant[]>([]);
  const [previewingKey, setPreviewingKey] = useState<string | null>(null);

  const accentChoices = useMemo(() => {
    if (accentOptions.length > 0) return accentOptions;
    if (defaultAccent) return [defaultAccent];
    if (selection.voice_accent || selection.voice_locale) {
      return [
        {
          key: "saved",
          language: selection.voice_language ?? "en",
          accent: selection.voice_accent,
          locale: selection.voice_locale,
          preview_url: null,
        },
      ];
    }
    return [];
  }, [accentOptions, defaultAccent, selection]);

  const selectedKey =
    accentChoices.find((o) => accentOptionMatchesSelection(o, selection))
      ?.key ??
    accentChoices[0]?.key ??
    "";

  const accentFilterOptions = useMemo(
    () =>
      VOICE_LIBRARY_ACCENTS.filter((a) => a.value !== "all").map((a) => ({
        value: a.value,
        label: a.label,
      })),
    []
  );

  function applyOption(option: AccentOption) {
    onSelectionChange({
      voice_accent: option.accent,
      voice_locale: option.locale,
      voice_language: option.language,
    });
  }

  async function previewAccentOption(option: AccentOption) {
    stopVoicePreview();
    setPreviewingKey(option.key);
    const ok = await playVoicePreview({
      previewUrl: option.preview_url ?? undefined,
      voiceId: option.preview_url ? undefined : voiceId ?? undefined,
      name: voiceName ?? characterName,
      text: `Hello, I am ${characterName}.`,
      onEnd: () => setPreviewingKey(null),
    });
    if (!ok) {
      setPreviewingKey(null);
      toast.error("Could not play accent preview");
    }
  }

  async function searchVariants() {
    if (!voiceName) return;
    setSearching(true);
    setVariants([]);
    try {
      const res = await fetch("/api/voices/adapt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "search",
          voice_name: voiceName,
          target_accent: targetAccent,
          gender: gender && gender !== "unknown" ? gender : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setVariants(data.variants ?? []);
      if (!(data.variants?.length ?? 0)) {
        toast.message("No library variants found — try remix instead");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function importVariant(variant: SharedVoice) {
    setVariants((prev) =>
      prev.map((v) =>
        v.voice_id === variant.voice_id ? { ...v, importing: true } : v
      )
    );
    try {
      const res = await fetch("/api/voices/adapt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "import",
          public_owner_id: variant.public_owner_id,
          voice_id: variant.voice_id,
          new_name: `${variant.name} – ${characterName}`.slice(0, 120),
          accent: variant.accent ?? targetAccent,
          locale: variant.locale ?? null,
          language: variant.language ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      onVoiceReplaced(data);
      toast.success(`Using ${data.voice_name}`);
      setShowAdapt(false);
      setVariants([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setVariants((prev) =>
        prev.map((v) =>
          v.voice_id === variant.voice_id ? { ...v, importing: false } : v
        )
      );
    }
  }

  async function remixAccent() {
    if (!voiceId || !voiceName) return;
    setRemixing(true);
    try {
      const res = await fetch("/api/voices/adapt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "remix",
          voice_id: voiceId,
          voice_name: voiceName,
          target_accent: targetAccent,
          character_name: characterName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Remix failed");
      onVoiceReplaced(data);
      toast.success(`Created ${data.voice_name}`);
      setShowAdapt(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Remix failed");
    } finally {
      setRemixing(false);
    }
  }

  if (!voiceId) return null;

  return (
    <div className="space-y-3 rounded-lg border border-border-muted/60 p-4">
      <div>
        <p className="text-body-sm font-medium text-ink">Character accent</p>
        <p className="text-[11px] text-slate mt-0.5">
          Pick a verified accent for this voice, or adapt from the library /
          remix.
        </p>
      </div>

      {accentChoices.length > 1 ? (
        <div className="space-y-2">
          <Label>Verified accent</Label>
          <div className="flex flex-wrap gap-2">
            {accentChoices.map((option) => (
              <Button
                key={option.key}
                type="button"
                size="sm"
                variant={selectedKey === option.key ? "default" : "secondary"}
                className="h-8 text-xs"
                onClick={() => applyOption(option)}
              >
                {formatAccentOptionLabel(option)}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {accentChoices.map((option) => (
              <Button
                key={`preview-${option.key}`}
                type="button"
                size="sm"
                variant="secondary"
                className="h-8 text-xs"
                disabled={previewingKey === option.key}
                onClick={() => previewAccentOption(option)}
              >
                {previewingKey === option.key ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Play className="h-3 w-3 mr-1" />
                )}
                Preview {formatAccentLabel(option.accent)}
              </Button>
            ))}
          </div>
        </div>
      ) : accentChoices.length === 1 ? (
        <p className="text-body-sm text-slate">
          Default accent:{" "}
          <span className="text-ink font-medium">
            {formatAccentOptionLabel(accentChoices[0]!)}
          </span>
        </p>
      ) : (
        <p className="text-body-sm text-slate">
          No verified accent options — use adapt below to pick an accent
          variant.
        </p>
      )}

      {selection.voice_accent ? (
        <p className="text-[11px] text-slate">
          Selected: {formatAccentLabel(selection.voice_accent)}
          {selection.voice_locale ? ` · ${selection.voice_locale}` : ""}
        </p>
      ) : null}

      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setShowAdapt((v) => !v)}
      >
        <Sparkles className="h-3 w-3 mr-1" />
        {showAdapt ? "Hide adapt accent" : "Adapt accent"}
      </Button>

      {showAdapt ? (
        <div className="space-y-3 rounded-md border border-dashed border-border-muted/80 p-3">
          <div>
            <Label>Target accent</Label>
            <SearchableFilterSelect
              label=""
              value={targetAccent}
              onValueChange={setTargetAccent}
              options={accentFilterOptions}
              placeholder="Search accents…"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={searching || !voiceName}
              onClick={searchVariants}
            >
              {searching ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Search className="h-3 w-3 mr-1" />
              )}
              Find library variant
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={remixing}
              onClick={remixAccent}
            >
              {remixing ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Sparkles className="h-3 w-3 mr-1" />
              )}
              Remix voice
            </Button>
          </div>
          {variants.length > 0 ? (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {variants.map((v) => (
                <div
                  key={`${v.public_owner_id}-${v.voice_id}`}
                  className="flex items-center justify-between gap-2 rounded border border-border-muted/50 px-2 py-1.5 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{v.name}</p>
                    <p className="text-slate truncate">
                      {formatAccentLabel(v.accent ?? targetAccent)}
                      {v.locale ? ` · ${v.locale}` : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="shrink-0 h-7 text-[11px]"
                    disabled={v.importing}
                    onClick={() => importVariant(v)}
                  >
                    {v.importing ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      "Use"
                    )}
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
          <p className="text-[11px] text-slate">
            Library search finds a matching voice already recorded in that
            accent. Remix creates a new voice in your account (uses ElevenLabs
            credits).
          </p>
        </div>
      ) : null}
    </div>
  );
}
