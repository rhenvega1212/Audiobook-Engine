"use client";

import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { Play, Loader2 } from "lucide-react";
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

interface ElevenVoice {
  voice_id: string;
  name: string;
  labels?: Record<string, string>;
}

export function VoicePickerDialog({
  character,
  sampleLines,
  open,
  onOpenChange,
  onSaved,
}: {
  character: Character;
  sampleLines: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [voices, setVoices] = useState<ElevenVoice[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(
    character.elevenlabs_voice_id
  );
  const [style, setStyle] = useState(character.voice_style ?? "");
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/voices")
      .then((r) => r.json())
      .then((d) => setVoices(d.voices ?? []));
    setSelectedId(character.elevenlabs_voice_id);
    setStyle(character.voice_style ?? "");
  }, [open, character]);

  async function playPreview(voiceId: string) {
    const text =
      sampleLines[0]?.slice(0, 200) ||
      `Hello, I am ${character.canonical_name}.`;
    setPlaying(voiceId);
    try {
      const res = await fetch("/api/voices/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice_id: voiceId, text }),
      });
      if (!res.ok) throw new Error("Preview failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setPlaying(null);
      await audio.play();
    } catch {
      toast.error("Could not play preview");
      setPlaying(null);
    }
  }

  async function handleSave() {
    if (!selectedId) return;
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
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Cast voice — {character.canonical_name}</DialogTitle>
        </DialogHeader>

        <div className="rounded-lg bg-warm-sand p-4 space-y-2 overflow-y-auto flex-1">
          {sampleLines.slice(0, 3).map((line, i) => (
            <p key={i} className="font-serif text-sm italic text-ink">
              &ldquo;{line}&rdquo;
            </p>
          ))}
        </div>

        <div className="overflow-y-auto max-h-64 space-y-1 border border-border-muted rounded-md">
          {voices.map((v) => (
            <div
              key={v.voice_id}
              className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors ${
                selectedId === v.voice_id
                  ? "bg-warm-sand border-l-[3px] border-l-teal"
                  : "hover:bg-warm-sand/50"
              }`}
              onClick={() => setSelectedId(v.voice_id)}
            >
              <div>
                <p className="font-medium text-sm">{v.name}</p>
                <p className="text-xs text-slate">
                  {[v.labels?.gender, v.labels?.accent, v.labels?.age]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  playPreview(v.voice_id);
                }}
              >
                {playing === v.voice_id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Play className="h-3 w-3" />
                )}
                Play
              </Button>
            </div>
          ))}
        </div>

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
