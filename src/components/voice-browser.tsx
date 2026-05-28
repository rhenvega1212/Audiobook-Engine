"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, Play, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type ElevenVoice,
  type VoiceAssignment,
  voiceUsedByOtherCharacter,
} from "@/lib/elevenlabs/voice-picker-utils";

type SharedVoice = {
  voice_id: string;
  name: string;
  public_owner_id: string;
  gender?: string;
  accent?: string;
  age?: string;
  descriptive?: string;
  preview_url?: string;
  labels?: Record<string, string>;
};

export function VoiceBrowser({
  selectedId,
  onSelect,
  onVoicesChange,
  genderDefault = "all",
  compact = false,
  currentCharacterId,
  assignedVoices,
}: {
  selectedId: string | null;
  onSelect: (voiceId: string) => void;
  onVoicesChange?: (voices: ElevenVoice[]) => void;
  genderDefault?: "all" | "male" | "female";
  compact?: boolean;
  /** Character being cast — their current voice stays selectable. */
  currentCharacterId?: string;
  assignedVoices?: VoiceAssignment[];
}) {
  const [tab, setTab] = useState<"mine" | "library">("mine");
  const [search, setSearch] = useState("");
  const [gender, setGender] = useState(genderDefault);
  const [myVoices, setMyVoices] = useState<ElevenVoice[]>([]);
  const [libraryVoices, setLibraryVoices] = useState<SharedVoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);

  const loadMyVoices = useCallback(async (q?: string) => {
    setLoading(true);
    const params = q?.trim() ? `?search=${encodeURIComponent(q.trim())}` : "";
    const res = await fetch(`/api/voices${params}`);
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      toast.error(data.error ?? "Failed to load voices");
      return;
    }
    const voices = data.voices ?? [];
    setMyVoices(voices);
    onVoicesChange?.(voices);
  }, [onVoicesChange]);

  const loadLibrary = useCallback(async (q?: string, g?: string) => {
    setLoading(true);
    const params = new URLSearchParams({ page_size: "30" });
    if (q?.trim()) params.set("search", q.trim());
    if (g && g !== "all") params.set("gender", g);
    const res = await fetch(`/api/voices/shared?${params.toString()}`);
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      toast.error(data.error ?? "Library search failed");
      return;
    }
    setLibraryVoices(data.voices ?? []);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      if (tab === "mine") loadMyVoices(search);
      else loadLibrary(search, gender);
    }, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [search, tab, gender, loadMyVoices, loadLibrary]);

  async function playPreview(
    voiceId: string,
    name: string,
    previewUrl?: string
  ) {
    setPreviewLoading(voiceId);
    try {
      if (previewUrl) {
        const audio = new Audio(previewUrl);
        setPlaying(voiceId);
        audio.onended = () => setPlaying(null);
        await audio.play();
        return;
      }
      const res = await fetch("/api/voices/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voice_id: voiceId,
          text: `Hello, I'm ${name}.`,
        }),
      });
      if (!res.ok) throw new Error("Preview failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      setPlaying(voiceId);
      audio.onended = () => {
        setPlaying(null);
        URL.revokeObjectURL(url);
      };
      await audio.play();
    } catch {
      toast.error("Could not play preview");
    } finally {
      setPreviewLoading(null);
    }
  }

  async function importVoice(v: SharedVoice) {
    setImporting(v.voice_id);
    const res = await fetch("/api/voices/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        public_user_id: v.public_owner_id,
        voice_id: v.voice_id,
        new_name: v.name,
      }),
    });
    const data = await res.json();
    setImporting(null);
    if (!res.ok) {
      toast.error(data.error ?? "Import failed");
      return;
    }
    toast.success(`Imported "${v.name}" to your library`);
    onSelect(data.voice_id);
    setTab("mine");
    await loadMyVoices();
  }

  const displayMy = useMemo(() => myVoices, [myVoices]);

  const hasAssignedElsewhere = useMemo(
    () =>
      assignedVoices?.some((a) => a.character_id !== currentCharacterId) ?? false,
    [assignedVoices, currentCharacterId]
  );

  function trySelect(voiceId: string) {
    if (!currentCharacterId) {
      onSelect(voiceId);
      return;
    }
    const used = voiceUsedByOtherCharacter(
      voiceId,
      currentCharacterId,
      assignedVoices
    );
    if (used) {
      toast.message(`Already cast as ${used.character_name}`);
      return;
    }
    onSelect(voiceId);
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={tab === "mine" ? "default" : "secondary"}
          onClick={() => setTab("mine")}
        >
          My voices
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tab === "library" ? "default" : "secondary"}
          onClick={() => setTab("library")}
        >
          ElevenLabs library
        </Button>
      </div>

      <div className={`flex gap-2 ${compact ? "flex-col" : "flex-wrap items-end"}`}>
        <div className="flex-1 min-w-[180px]">
          <Label htmlFor="voice-search">Search</Label>
          <div className="relative mt-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate" />
            <Input
              id="voice-search"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                tab === "mine" ? "Search your voices…" : "Search ElevenLabs library…"
              }
            />
          </div>
        </div>
        {tab === "library" && (
          <div>
            <Label>Gender</Label>
            <Select
              value={gender}
              onValueChange={(v) => setGender(v as "all" | "male" | "female")}
            >
              <SelectTrigger className="w-32 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="male">Male</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {hasAssignedElsewhere && (
        <p className="text-[11px] text-slate">
          Voices already cast to another character are greyed out.
        </p>
      )}

      <div className="overflow-y-auto max-h-64 space-y-1 border border-border-muted rounded-md">
        {loading && (
          <p className="px-3 py-4 text-sm text-slate flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        )}

        {!loading && tab === "mine" && displayMy.length === 0 && (
          <p className="px-3 py-4 text-sm text-slate">
            No voices found. Try the ElevenLabs library tab to import voices.
          </p>
        )}

        {!loading &&
          tab === "mine" &&
          displayMy.map((v) => {
            const usedBy = currentCharacterId
              ? voiceUsedByOtherCharacter(
                  v.voice_id,
                  currentCharacterId,
                  assignedVoices
                )
              : undefined;
            return (
              <VoiceRow
                key={v.voice_id}
                selected={selectedId === v.voice_id}
                disabled={!!usedBy}
                disabledLabel={
                  usedBy ? `Cast as ${usedBy.character_name}` : undefined
                }
                name={v.name}
                meta={[v.labels?.gender, v.labels?.accent, v.labels?.age]
                  .filter(Boolean)
                  .join(" · ")}
                playing={playing === v.voice_id}
                previewLoading={previewLoading === v.voice_id}
                onSelect={() => trySelect(v.voice_id)}
                onPlay={() => playPreview(v.voice_id, v.name)}
              />
            );
          })}

        {!loading && tab === "library" && libraryVoices.length === 0 && (
          <p className="px-3 py-4 text-sm text-slate">
            No library voices match your search.
          </p>
        )}

        {!loading &&
          tab === "library" &&
          libraryVoices.map((v) => {
            const usedBy = currentCharacterId
              ? voiceUsedByOtherCharacter(
                  v.voice_id,
                  currentCharacterId,
                  assignedVoices
                )
              : undefined;
            const libraryDisabled = !!usedBy;
            return (
            <div
              key={`${v.public_owner_id}-${v.voice_id}`}
              className={`flex items-center justify-between px-3 py-2 gap-2 ${
                libraryDisabled
                  ? "opacity-50 bg-slate/5 cursor-not-allowed"
                  : selectedId === v.voice_id
                    ? "bg-warm-sand border-l-[3px] border-l-teal"
                    : "hover:bg-warm-sand/50"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm truncate">{v.name}</p>
                {usedBy && (
                  <p className="text-[10px] text-slate italic">
                    Already cast as {usedBy.character_name}
                  </p>
                )}
                <p className="text-xs text-slate truncate">
                  {[
                    v.gender ?? v.labels?.gender,
                    v.accent ?? v.labels?.accent,
                    v.age ?? v.labels?.age,
                    v.descriptive,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={previewLoading === v.voice_id}
                  onClick={() => playPreview(v.voice_id, v.name, v.preview_url)}
                >
                  {previewLoading === v.voice_id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Play className="h-3 w-3" />
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={libraryDisabled || importing === v.voice_id}
                  onClick={() => {
                    if (libraryDisabled) {
                      toast.message(`Already cast as ${usedBy!.character_name}`);
                      return;
                    }
                    void importVoice(v);
                  }}
                >
                  {importing === v.voice_id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Download className="h-3 w-3" />
                  )}
                  Import
                </Button>
              </div>
            </div>
            );
          })}
      </div>
    </div>
  );
}

function VoiceRow({
  selected,
  disabled = false,
  disabledLabel,
  name,
  meta,
  playing,
  previewLoading,
  onSelect,
  onPlay,
}: {
  selected: boolean;
  disabled?: boolean;
  disabledLabel?: string;
  name: string;
  meta: string;
  playing: boolean;
  previewLoading: boolean;
  onSelect: () => void;
  onPlay: () => void;
}) {
  return (
    <div
      className={`flex items-center justify-between px-3 py-2 transition-colors ${
        disabled
          ? "opacity-50 bg-slate/5 cursor-not-allowed"
          : selected
            ? "bg-warm-sand border-l-[3px] border-l-teal cursor-pointer"
            : "hover:bg-warm-sand/50 cursor-pointer"
      }`}
      onClick={disabled ? undefined : onSelect}
    >
      <div className="min-w-0">
        <p className="font-medium text-sm truncate">{name}</p>
        {disabledLabel && (
          <p className="text-[10px] text-slate italic">{disabledLabel}</p>
        )}
        {meta && <p className="text-xs text-slate">{meta}</p>}
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          onPlay();
        }}
        disabled={previewLoading}
      >
        {previewLoading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : playing ? (
          <Play className="h-3 w-3 fill-current" />
        ) : (
          <Play className="h-3 w-3" />
        )}
        Play
      </Button>
    </div>
  );
}
