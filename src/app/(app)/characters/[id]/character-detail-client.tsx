"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { VoicePickerDialog } from "@/components/voice-picker-dialog";
import { voiceAssignmentsFromCharacters } from "@/lib/elevenlabs/voice-picker-utils";
import { formatVoiceCastSummary } from "@/lib/elevenlabs/voice-cast";
import { formatAccentLabel } from "@/lib/elevenlabs/voice-accents";
import type { Character, CharacterRole } from "@/lib/types/database";
import {
  ROLE_LABELS,
  type LibraryCharacter,
} from "@/lib/characters/character-library";

export function CharacterDetailClient({
  character,
  library,
  sampleLines,
  seriesCharacters,
  history,
  appearances,
}: {
  character: Character;
  library: LibraryCharacter;
  sampleLines: string[];
  seriesCharacters: Pick<
    Character,
    "id" | "canonical_name" | "elevenlabs_voice_id"
  >[];
  history: {
    changed_at: string;
    old_voice_name: string | null;
    new_voice_name: string | null;
  }[];
  appearances: { title: string; line_count: number }[];
}) {
  const router = useRouter();
  const seriesVoiceAssignments = useMemo(
    () => voiceAssignmentsFromCharacters(seriesCharacters),
    [seriesCharacters]
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [style, setStyle] = useState(character.voice_style ?? "");
  const [gender, setGender] = useState(character.gender);
  const [role, setRole] = useState<CharacterRole>(character.role ?? "guest");

  async function patchCharacter(body: Record<string, unknown>) {
    const res = await fetch(`/api/characters/${character.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      toast.error("Save failed");
      return false;
    }
    toast.success("Saved");
    router.refresh();
    return true;
  }

  async function saveStyle() {
    await patchCharacter({ voice_style: style });
  }

  async function saveProfile() {
    await patchCharacter({ gender, role });
  }

  return (
    <div className="mt-6 space-y-8">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h1 className="font-serif text-h1">{character.canonical_name}</h1>
          <p className="text-slate mt-1">
            {(character.series as { name?: string })?.name}
          </p>
        </div>
        <Badge variant="main">{library.tier_label}</Badge>
        <Badge variant={library.cast_status === "cast" ? "cast" : "needsVoice"}>
          {library.cast_status === "cast" ? "Cast" : "Needs voice"}
        </Badge>
        {library.total_lines > 0 && (
          <span className="text-body-sm text-slate">
            {library.total_lines.toLocaleString()} lines across{" "}
            {library.book_count} book{library.book_count === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Tier (role)</Label>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as CharacterRole)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_LABELS) as CharacterRole[]).map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-body-sm text-slate">
                Auto-tier uses line counts unless you pick a role other than
                Guest.
              </p>
            </div>
            <div>
              <Label>Gender</Label>
              <Select
                value={gender}
                onValueChange={(v) =>
                  setGender(v as Character["gender"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {(character.aliases?.length ?? 0) > 0 && (
            <p className="text-body-sm text-slate">
              Aliases: {character.aliases.join(", ")}
            </p>
          )}
          <Button onClick={saveProfile}>Save profile</Button>
        </CardContent>
      </Card>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Voice assignment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            <span className="text-slate text-body-sm">Voice: </span>
            {character.elevenlabs_voice_name ?? "Not cast"}
          </p>
          {character.elevenlabs_voice_id ? (
            <p className="text-body-sm text-slate">
              Cast: {formatVoiceCastSummary(character)}
            </p>
          ) : null}
          {character.voice_accent ? (
            <p className="text-body-sm text-slate">
              Accent: {formatAccentLabel(character.voice_accent)}
              {character.voice_locale ? ` (${character.voice_locale})` : ""}
            </p>
          ) : null}
          <div>
            <Label htmlFor="style">Style descriptor</Label>
            <Input
              id="style"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setPickerOpen(true)}>
              Change voice
            </Button>
            <Button onClick={saveStyle}>Save style</Button>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="font-serif text-h2 mb-4">Books appearing in</h2>
        <ul className="space-y-1 text-body-sm">
          {appearances.map((a, i) => (
            <li key={i}>
              {a.title} — {a.line_count} lines
            </li>
          ))}
          {appearances.length === 0 && (
            <li className="text-slate">No books yet</li>
          )}
        </ul>
      </div>

      <div>
        <h2 className="font-serif text-h2 mb-4">Casting history</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.map((h, i) => (
              <TableRow key={i}>
                <TableCell>
                  {new Date(h.changed_at).toLocaleString()}
                </TableCell>
                <TableCell>{h.old_voice_name ?? "—"}</TableCell>
                <TableCell>{h.new_voice_name ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <VoicePickerDialog
        character={character}
        sampleLines={sampleLines}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSaved={() => router.refresh()}
        assignedVoices={seriesVoiceAssignments}
      />
    </div>
  );
}
