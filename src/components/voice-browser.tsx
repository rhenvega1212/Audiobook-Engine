"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, Play, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableFilterSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";
import {
  type ElevenVoice,
  type VoiceAssignment,
  voiceUsedByOtherCharacter,
} from "@/lib/elevenlabs/voice-picker-utils";
import {
  VOICE_LIBRARY_ACCENTS,
  VOICE_LIBRARY_LANGUAGES,
} from "@/lib/elevenlabs/voice-library-filters";
import {
  playVoicePreview,
  stopVoicePreview,
} from "@/lib/elevenlabs/voice-preview-player";

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
  embedded = false,
  currentCharacterId,
  assignedVoices,
}: {
  selectedId: string | null;
  onSelect: (voiceId: string) => void;
  onVoicesChange?: (voices: ElevenVoice[]) => void;
  genderDefault?: "all" | "male" | "female";
  compact?: boolean;
  /** Inside cast dialog — shorter list, horizontal filters. */
  embedded?: boolean;
  /** Character being cast — their current voice stays selectable. */
  currentCharacterId?: string;
  assignedVoices?: VoiceAssignment[];
}) {
  const [tab, setTab] = useState<"mine" | "library">("mine");
  const [search, setSearch] = useState("");
  const [gender, setGender] = useState(genderDefault);
  const [age, setAge] = useState<"all" | "young" | "middle_aged" | "old">("all");
  const [language, setLanguage] = useState("all");
  const [accent, setAccent] = useState("all");
  const [myVoices, setMyVoices] = useState<ElevenVoice[]>([]);
  const [libraryVoices, setLibraryVoices] = useState<SharedVoice[]>([]);
  const [libraryPage, setLibraryPage] = useState(0);
  const [libraryHasMore, setLibraryHasMore] = useState(false);
  const [libraryTotal, setLibraryTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
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

  const loadLibrary = useCallback(
    async (
      q?: string,
      g?: string,
      a?: string,
      lang?: string,
      acc?: string,
      page = 0,
      append = false
    ) => {
      if (append) setLoadingMore(true);
      else setLoading(true);

      const params = new URLSearchParams({ page_size: "100", page: String(page) });
      if (q?.trim()) params.set("search", q.trim());
      if (g && g !== "all") params.set("gender", g);
      if (a && a !== "all") params.set("age", a);
      if (lang && lang !== "all") params.set("language", lang);
      if (acc && acc !== "all") params.set("accent", acc);

      const res = await fetch(`/api/voices/shared?${params.toString()}`);
      const data = await res.json();

      if (append) setLoadingMore(false);
      else setLoading(false);

      if (!res.ok) {
        toast.error(data.error ?? "Library search failed");
        return;
      }

      const voices: SharedVoice[] = data.voices ?? [];
      setLibraryVoices((prev) => (append ? [...prev, ...voices] : voices));
      setLibraryPage(page);
      setLibraryHasMore(!!data.has_more);
      setLibraryTotal(
        typeof data.total_count === "number" ? data.total_count : null
      );
    },
    []
  );

  useEffect(() => {
    const t = setTimeout(() => {
      if (tab === "mine") loadMyVoices(search);
      else loadLibrary(search, gender, age, language, accent, 0, false);
    }, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [search, tab, gender, age, language, accent, loadMyVoices, loadLibrary]);

  useEffect(() => () => stopVoicePreview(), []);

  async function playPreview(
    voiceId: string,
    name: string,
    previewUrl?: string
  ) {
    setPreviewLoading(voiceId);
    const ok = await playVoicePreview({
      voiceId: previewUrl ? undefined : voiceId,
      name,
      previewUrl,
      onStart: () => setPlaying(voiceId),
      onEnd: () => setPlaying(null),
    });
    setPreviewLoading(null);
    if (!ok) {
      setPlaying(null);
      toast.error("Could not play preview");
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
      toast.message(
        `Also used by ${used.character_name} — set a different style or tuning.`
      );
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

      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <div className={embedded ? "min-w-[140px] flex-1" : "flex-1 min-w-[180px]"}>
          <Label htmlFor="voice-search" className={compact ? "text-[10px]" : undefined}>
            Search
          </Label>
          <div className="relative mt-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate" />
            <Input
              id="voice-search"
              className={cn("pl-8", compact && "h-8 text-xs")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                tab === "mine" ? "Search your voices…" : "Search ElevenLabs library…"
              }
            />
          </div>
        </div>
        {tab === "library" && (
          <>
            <SearchableFilterSelect
              compact={compact}
              label="Gender"
              value={gender}
              onValueChange={(v) => setGender(v as "all" | "male" | "female")}
              options={[
                { value: "all", label: "All" },
                { value: "female", label: "Female" },
                { value: "male", label: "Male" },
              ]}
              placeholder="Search gender…"
              triggerClassName="w-[5.5rem]"
            />
            <SearchableFilterSelect
              compact={compact}
              label="Age"
              value={age}
              onValueChange={(v) =>
                setAge(v as "all" | "young" | "middle_aged" | "old")
              }
              options={[
                { value: "all", label: "All ages" },
                { value: "middle_aged", label: "Middle-aged" },
                { value: "old", label: "Old" },
                { value: "young", label: "Young" },
              ]}
              placeholder="Search age…"
              triggerClassName="w-[5.75rem]"
            />
            <SearchableFilterSelect
              compact={compact}
              label="Language"
              value={language}
              onValueChange={setLanguage}
              options={VOICE_LIBRARY_LANGUAGES.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
              placeholder="Search language…"
              triggerClassName="w-[6.5rem]"
            />
            <SearchableFilterSelect
              compact={compact}
              label="Accent"
              value={accent}
              onValueChange={setAccent}
              options={VOICE_LIBRARY_ACCENTS.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
              placeholder="Search accent…"
              triggerClassName="w-[6.5rem]"
            />
          </>
        )}
      </div>

      {tab === "library" && !loading && libraryTotal != null && (
        <p className="text-[11px] text-slate">
          Showing {libraryVoices.length.toLocaleString()} of{" "}
          {libraryTotal.toLocaleString()} library voice
          {libraryTotal === 1 ? "" : "s"}
          {search.trim().includes(" ") &&
            libraryTotal <= 10 &&
            " — try fewer words (e.g. “old”) or use the Age filter for broader matches"}
        </p>
      )}

      {tab === "mine" && !loading && (
        <p className="text-[11px] text-slate">
          My voices searches only voices already in your ElevenLabs account. Use
          the library tab to browse and import more.
        </p>
      )}

      {hasAssignedElsewhere && (
        <p className="text-[11px] text-slate">
          Voices already cast to another character are greyed out.
        </p>
      )}

      <div
        className={cn(
          "overflow-y-auto space-y-1 border border-border-muted rounded-md",
          embedded ? "max-h-44" : "max-h-64"
        )}
      >
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

      {tab === "library" && libraryHasMore && !loading && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="w-full"
          disabled={loadingMore}
          onClick={() =>
            void loadLibrary(
              search,
              gender,
              age,
              language,
              accent,
              libraryPage + 1,
              true
            )
          }
        >
          {loadingMore ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading more…
            </>
          ) : (
            `Load more (${libraryVoices.length.toLocaleString()} of ${(libraryTotal ?? libraryVoices.length).toLocaleString()})`
          )}
        </Button>
      )}
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
