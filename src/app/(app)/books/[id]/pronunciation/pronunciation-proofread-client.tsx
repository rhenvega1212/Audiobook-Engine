"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
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
import { Card } from "@/components/ui/card";
import { useLineAudioPlayer } from "@/components/audio/line-player";
import { PerformLineRecorder } from "@/components/audio/perform-line-recorder";
import {
  applyPronunciations,
  type PronunciationEntry,
} from "@/lib/pronunciation/apply";

type LineRow = {
  id: string;
  line_order: number;
  speaker_label: string;
  line_text: string;
  spoken_text: string;
  export_preview: string;
  has_dictionary_hit: boolean;
  has_override: boolean;
  voice_id: string | null;
  voice_name: string | null;
};

type Filter = "all" | "dictionary" | "overrides";

export function PronunciationProofreadClient({
  bookId,
  bookTitle,
  seriesId,
  lines: initialLines,
  dictionary,
  dictionaryCount,
}: {
  bookId: string;
  bookTitle: string;
  seriesId: string;
  lines: LineRow[];
  dictionary: PronunciationEntry[];
  dictionaryCount: number;
}) {
  const [lines, setLines] = useState(initialLines);
  const [filter, setFilter] = useState<Filter>("dictionary");
  const [saving, setSaving] = useState<string | null>(null);
  const { playingId, loadingId, playLine } = useLineAudioPlayer();

  const filtered = useMemo(() => {
    if (filter === "dictionary") {
      return lines.filter((l) => l.has_dictionary_hit || l.has_override);
    }
    if (filter === "overrides") {
      return lines.filter((l) => l.has_override);
    }
    return lines;
  }, [lines, filter]);

  async function saveLine(lineId: string, spokenText: string) {
    setSaving(lineId);
    const res = await fetch(`/api/books/${bookId}/lines/${lineId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        spoken_text: spokenText.trim() || null,
      }),
    });
    setSaving(null);
    if (!res.ok) {
      toast.error("Could not save");
      return;
    }
    toast.success("Saved");
  }

  function updateLocal(lineId: string, spokenText: string) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== lineId) return l;
        const base = spokenText.trim() || l.line_text;
        const export_preview = applyPronunciations(base, dictionary);
        const autoExport = applyPronunciations(l.line_text, dictionary);
        return {
          ...l,
          spoken_text: spokenText,
          export_preview,
          has_override: !!spokenText.trim(),
          has_dictionary_hit: autoExport !== l.line_text,
        };
      })
    );
  }

  return (
    <div>
      <Link
        href={`/books/${bookId}`}
        className="text-body-sm text-teal hover:underline"
      >
        ← {bookTitle}
      </Link>

      <h1 className="font-serif text-h1 mt-4">Pronunciation & proofread</h1>
      <p className="mt-2 text-body-sm text-slate max-w-2xl">
        Edit how each line will be spoken in the export. Series dictionary has{" "}
        {dictionaryCount} entries — manage them in{" "}
        <Link href="/settings" className="text-teal hover:underline">
          Settings
        </Link>
        .
      </p>

      <div className="mt-6 flex flex-wrap gap-4 items-end">
        <div>
          <Label>Show</Label>
          <Select
            value={filter}
            onValueChange={(v) => setFilter(v as Filter)}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dictionary">
                Dictionary matches ({lines.filter((l) => l.has_dictionary_hit || l.has_override).length})
              </SelectItem>
              <SelectItem value="overrides">Manual overrides only</SelectItem>
              <SelectItem value="all">All lines ({lines.length})</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button asChild variant="secondary">
          <Link href={`/books/${bookId}/listen`}>Listen to full manuscript</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href={`/books/${bookId}/export`}>Continue to export</Link>
        </Button>
      </div>

      <div className="mt-8 space-y-4 max-h-[70vh] overflow-y-auto pr-2">
        {filtered.length === 0 && (
          <p className="text-slate font-serif italic">
            No lines match this filter. Add words in Settings → Pronunciation dictionary.
          </p>
        )}
        {filtered.map((line) => (
          <Card key={line.id} className="p-4">
            <p className="text-xs uppercase tracking-wider text-slate mb-2">
              #{line.line_order + 1} · {line.speaker_label}
            </p>
            <p className="text-body-sm text-slate mb-1">Manuscript</p>
            <p className="font-serif text-sm mb-3">{line.line_text}</p>
            <p className="text-body-sm text-slate mb-1">Export preview</p>
            <p className="font-serif text-sm text-teal mb-3">
              {line.export_preview}
            </p>
            <div>
              <Label htmlFor={`spoken-${line.id}`}>
                Spoken line override (optional)
              </Label>
              <Input
                id={`spoken-${line.id}`}
                className="mt-1"
                value={line.spoken_text}
                onChange={(e) => updateLocal(line.id, e.target.value)}
                placeholder="Leave blank to use manuscript + dictionary"
              />
            </div>
            <Button
              size="sm"
              className="mt-2 mr-2"
              disabled={saving === line.id}
              onClick={() => saveLine(line.id, line.spoken_text)}
            >
              {saving === line.id ? "Saving…" : "Save line"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="mt-2"
              disabled={!line.voice_id || loadingId !== null}
              onClick={() =>
                playLine(line.id, line.voice_id ?? "", line.export_preview)
              }
            >
              {loadingId === line.id
                ? "Generating…"
                : playingId === line.id
                  ? "Playing…"
                  : "Listen"}
            </Button>
            {line.voice_id && (
              <div className="mt-3">
                <PerformLineRecorder
                  lineId={line.id}
                  voiceId={line.voice_id}
                  voiceName={line.voice_name}
                  spokenText={line.export_preview}
                  compact
                />
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
