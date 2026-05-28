"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { toast } from "sonner";
import { Play, Loader2, Star } from "lucide-react";
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
  voiceUsedByOtherCharacter,
} from "@/lib/elevenlabs/voice-picker-utils";
import { VoiceBrowser } from "@/components/voice-browser";

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
  /** Other characters in the series already using a voice (for duplicate prevention). */
  assignedVoices?: VoiceAssignment[];
}) {
  const [voices, setVoices] = useState<ElevenVoice[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(
    character.elevenlabs_voice_id
  );
  const [style, setStyle] = useState(character.voice_style ?? "");
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedId(character.elevenlabs_voice_id);
    setStyle(character.voice_style ?? "");
  }, [open, character]);

  const recommendedId = useMemo(
    () => getRecommendedVoiceId(character, voices),
    [character, voices]
  );

  async function playSample() {
    if (!selectedId) return;
    const text =
      sampleLines[0]?.slice(0, 200) ||
      `Hello, I am ${character.canonical_name}.`;
    setPlaying(true);
    try {
      const res = await fetch("/api/voices/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice_id: selectedId, text }),
      });
      if (!res.ok) throw new Error("Preview failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      audioRef.current?.pause();
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setPlaying(false);
      await audio.play();
    } catch {
      toast.error("Could not play preview");
      setPlaying(false);
    }
  }

  async function handleSave() {
    if (!selectedId) return;
    const used = voiceUsedByOtherCharacter(
      selectedId,
      character.id,
      assignedVoices
    );
    if (used) {
      toast.error(`This voice is already cast as ${used.character_name}`);
      return;
    }
    const voice = voices.find((v) => v.voice_id === selectedId);
    setLoading(true);
    const res = await fetch(`/api/characters/${character.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        elevenlabs_voice_id: selectedId,
        elevenlabs_voice_name: voice?.name ?? null,
        voice_style: style || null,
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Cast voice — {character.canonical_name}</DialogTitle>
        </DialogHeader>

        {sampleLines.length > 0 ? (
          <div className="rounded-lg bg-warm-sand p-4 space-y-2 overflow-y-auto max-h-28">
            {sampleLines.slice(0, 3).map((line, i) => (
              <p key={i} className="font-serif text-sm italic text-ink break-words">
                &ldquo;{line}&rdquo;
              </p>
            ))}
          </div>
        ) : (
          <p className="text-body-sm text-slate">
            Search your voices or browse the ElevenLabs library to import new ones.
          </p>
        )}

        <div className="flex items-center gap-2">
          {recommendedId &&
            !voiceUsedByOtherCharacter(
              recommendedId,
              character.id,
              assignedVoices
            ) && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setSelectedId(recommendedId)}
            >
              <Star className="h-3 w-3 mr-1" />
              Use recommended
            </Button>
          )}
          {recommendedId &&
            voiceUsedByOtherCharacter(
              recommendedId,
              character.id,
              assignedVoices
            ) && (
              <p className="text-[11px] text-slate">
                Recommended voice is already used by another character.
              </p>
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
              Preview sample
            </Button>
          )}
        </div>

        <VoiceBrowser
          selectedId={selectedId}
          onSelect={setSelectedId}
          onVoicesChange={setVoices}
          genderDefault={
            character.gender === "unknown" ? "all" : character.gender
          }
          compact
          currentCharacterId={character.id}
          assignedVoices={assignedVoices}
        />

        <div>
          <Label htmlFor="style">Style descriptor</Label>
          <Input
            id="style"
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            placeholder="Elegant & Lovely"
          />
        </div>

        <Button
          onClick={handleSave}
          disabled={!selectedId || loading}
          className="self-end"
        >
          Cast as {character.canonical_name}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
