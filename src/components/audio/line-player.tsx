"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

export function useLineAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingId(null);
  }, []);

  const playLine = useCallback(
    async (lineId: string, voiceId: string, text: string) => {
      if (!voiceId) {
        toast.error("No voice cast for this speaker");
        return false;
      }
      if (!text.trim()) {
        toast.error("Line is empty");
        return false;
      }

      if (playingId === lineId) {
        stop();
        return true;
      }

      setLoadingId(lineId);
      try {
        const res = await fetch("/api/voices/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            voice_id: voiceId,
            text: text.slice(0, 2500),
          }),
        });
        if (!res.ok) throw new Error("Playback failed");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        stop();
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          setPlayingId(null);
          URL.revokeObjectURL(url);
        };
        setPlayingId(lineId);
        await audio.play();
        return true;
      } catch {
        toast.error("Could not play line");
        return false;
      } finally {
        setLoadingId(null);
      }
    },
    [playingId, stop]
  );

  return { playingId, loadingId, playLine, stop, isPlaying: !!playingId };
}

export function PlayLineButton({
  lineId,
  voiceId,
  text,
  size = "sm",
  label = "Listen",
}: {
  lineId: string;
  voiceId: string | null;
  text: string;
  size?: "sm" | "default";
  label?: string;
}) {
  const { playingId, loadingId, playLine } = useLineAudioPlayer();
  const isThis = playingId === lineId || loadingId === lineId;
  const disabled = !voiceId;

  return (
    <Button
      type="button"
      variant="secondary"
      size={size}
      disabled={disabled || (loadingId !== null && loadingId !== lineId)}
      onClick={() => playLine(lineId, voiceId ?? "", text)}
    >
      {loadingId === lineId ? (
        <Loader2 className="h-3 w-3 animate-spin mr-1" />
      ) : playingId === lineId ? (
        <Pause className="h-3 w-3 mr-1" />
      ) : (
        <Play className="h-3 w-3 mr-1" />
      )}
      {label}
    </Button>
  );
}
