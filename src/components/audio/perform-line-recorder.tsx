"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Mic, MicOff, Play, Sparkles, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

type RecorderState = "idle" | "recording" | "recorded";

export function PerformLineRecorder({
  lineId,
  voiceId,
  voiceName,
  spokenText,
  compact = false,
}: {
  lineId: string;
  voiceId: string | null;
  voiceName?: string | null;
  spokenText: string;
  compact?: boolean;
}) {
  const [state, setState] = useState<RecorderState>("idle");
  const [isConverting, setIsConverting] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [convertedUrl, setConvertedUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState<"recording" | "converted" | null>(
    null
  );

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingBlobRef = useRef<Blob | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
      if (convertedUrl) URL.revokeObjectURL(convertedUrl);
      if (timerRef.current) clearInterval(timerRef.current);
      mediaRecorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, [recordingUrl, convertedUrl]);

  useEffect(() => {
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    if (convertedUrl) URL.revokeObjectURL(convertedUrl);
    setRecordingUrl(null);
    setConvertedUrl(null);
    recordingBlobRef.current = null;
    setState("idle");
    setIsConverting(false);
    setSeconds(0);
    setPlaying(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when line changes
  }, [lineId, spokenText, voiceId]);

  function stopPlayback() {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(null);
  }

  async function playUrl(url: string, kind: "recording" | "converted") {
    stopPlayback();
    const audio = new Audio(url);
    audioRef.current = audio;
    setPlaying(kind);
    audio.onended = () => setPlaying(null);
    await audio.play();
  }

  async function startRecording() {
    if (!voiceId) {
      toast.error("Cast a voice for this character first");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        recordingBlobRef.current = blob;
        if (recordingUrl) URL.revokeObjectURL(recordingUrl);
        const url = URL.createObjectURL(blob);
        setRecordingUrl(url);
        setConvertedUrl(null);
        setState("recorded");
        if (timerRef.current) clearInterval(timerRef.current);
      };

      recorder.start(250);
      setState("recording");
      setSeconds(0);
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s >= 120) {
            stopRecording();
            toast.message("Recording stopped — 2 minute limit");
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      toast.error("Microphone access denied or unavailable");
    }
  }

  function stopRecording() {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
  }

  async function convertRecording() {
    const blob = recordingBlobRef.current;
    if (!blob || !voiceId) return;

    setIsConverting(true);
    stopPlayback();

    const form = new FormData();
    form.append("voice_id", voiceId);
    form.append("audio", blob, "performance.webm");

    try {
      const res = await fetch("/api/voices/perform", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Conversion failed");
      }
      const out = await res.blob();
      if (convertedUrl) URL.revokeObjectURL(convertedUrl);
      const url = URL.createObjectURL(out);
      setConvertedUrl(url);
      setState("recorded");
      toast.success(`Converted to ${voiceName ?? "character voice"}`);
      await playUrl(url, "converted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Conversion failed");
      setState("recorded");
    } finally {
      setIsConverting(false);
    }
  }

  if (!voiceId) {
    return (
      <p className="text-body-sm text-slate">
        Cast a voice to record a performance for this line.
      </p>
    );
  }

  return (
    <div
      className={`rounded-md border border-border-muted bg-warm-sand/30 ${
        compact ? "p-3 space-y-2" : "p-4 space-y-3"
      }`}
    >
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-slate">
          Perform line
        </p>
        <p className="text-body-sm text-slate mt-1">
          Record yourself reading the line — ElevenLabs converts your cadence
          into {voiceName ? `"${voiceName}"` : "the character voice"}.
        </p>
      </div>

      {!compact && (
        <p className="font-serif text-sm italic text-ink break-words border-l-2 border-teal/40 pl-3">
          &ldquo;{spokenText}&rdquo;
        </p>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        {state === "recording" ? (
          <Button type="button" variant="destructive" size="sm" onClick={stopRecording}>
            <Square className="h-3 w-3 mr-1" />
            Stop ({seconds}s)
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={startRecording}
            disabled={isConverting}
          >
            <Mic className="h-3 w-3 mr-1" />
            {state === "recorded" ? "Re-record" : "Record my delivery"}
          </Button>
        )}

        {state === "recorded" && recordingUrl && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => playUrl(recordingUrl, "recording")}
            >
              {playing === "recording" ? (
                <MicOff className="h-3 w-3 mr-1" />
              ) : (
                <Play className="h-3 w-3 mr-1" />
              )}
              My recording
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={convertRecording}
              disabled={isConverting}
            >
              {isConverting ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Sparkles className="h-3 w-3 mr-1" />
              )}
              Convert to character
            </Button>
          </>
        )}

        {convertedUrl && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => playUrl(convertedUrl, "converted")}
          >
            {playing === "converted" ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Play className="h-3 w-3 mr-1" />
            )}
            Play character version
          </Button>
        )}
      </div>
    </div>
  );
}
