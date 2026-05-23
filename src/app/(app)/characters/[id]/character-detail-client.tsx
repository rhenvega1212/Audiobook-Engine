"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { VoicePickerDialog } from "@/components/voice-picker-dialog";
import type { Character } from "@/lib/types/database";

export function CharacterDetailClient({
  character,
  history,
  appearances,
}: {
  character: Character;
  history: {
    changed_at: string;
    old_voice_name: string | null;
    new_voice_name: string | null;
  }[];
  appearances: { title: string; line_count: number }[];
}) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [style, setStyle] = useState(character.voice_style ?? "");

  async function saveStyle() {
    const res = await fetch(`/api/characters/${character.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voice_style: style }),
    });
    if (!res.ok) toast.error("Save failed");
    else {
      toast.success("Style updated");
      router.refresh();
    }
  }

  return (
    <div className="mt-6 space-y-8">
      <div>
        <h1 className="font-serif text-h1">{character.canonical_name}</h1>
        <p className="text-slate mt-1">
          {(character.series as { name?: string })?.name}
        </p>
      </div>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Voice assignment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            <span className="text-slate text-body-sm">Voice: </span>
            {character.elevenlabs_voice_name ?? "Not cast"}
          </p>
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
        sampleLines={[]}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
