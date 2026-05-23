"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Pronunciation, Series } from "@/lib/types/database";

export function PronunciationsSection({ series }: { series: Series[] }) {
  const [seriesId, setSeriesId] = useState("");
  const [entries, setEntries] = useState<Pronunciation[]>([]);
  const [word, setWord] = useState("");
  const [spokenForm, setSpokenForm] = useState("");
  const [notes, setNotes] = useState("");
  const [open, setOpen] = useState(false);

  async function load(sid: string) {
    if (!sid) {
      setEntries([]);
      return;
    }
    const res = await fetch(`/api/pronunciations?series_id=${sid}`);
    setEntries(await res.json());
  }

  useEffect(() => {
    load(seriesId);
  }, [seriesId]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/pronunciations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        series_id: seriesId,
        word,
        spoken_form: spokenForm,
        notes: notes || null,
      }),
    });
    if (!res.ok) {
      toast.error("Could not add entry");
      return;
    }
    toast.success("Pronunciation added");
    setWord("");
    setSpokenForm("");
    setNotes("");
    setOpen(false);
    load(seriesId);
  }

  async function handleDelete(id: string) {
    await fetch(`/api/pronunciations/${id}`, { method: "DELETE" });
    load(seriesId);
    toast.success("Removed");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pronunciation dictionary</CardTitle>
        <p className="text-body-sm text-slate">
          Words and names for this series. Applied automatically on export;
          override per line during proofread.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Series</Label>
          <Select value={seriesId} onValueChange={setSeriesId}>
            <SelectTrigger className="max-w-sm">
              <SelectValue placeholder="Select series" />
            </SelectTrigger>
            <SelectContent>
              {series.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {seriesId && (
          <>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm">+ Add word</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add pronunciation</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAdd} className="space-y-4 pt-2">
                  <div>
                    <Label htmlFor="p-word">Word in manuscript</Label>
                    <Input
                      id="p-word"
                      value={word}
                      onChange={(e) => setWord(e.target.value)}
                      placeholder="Malveaux"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="p-spoken">Spoken form (for export)</Label>
                    <Input
                      id="p-spoken"
                      value={spokenForm}
                      onChange={(e) => setSpokenForm(e.target.value)}
                      placeholder="Mal-voh"
                      required
                    />
                    <p className="text-xs text-slate mt-1">
                      How ElevenLabs should read it — phonetic spelling or alias.
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="p-notes">Notes (optional)</Label>
                    <Input
                      id="p-notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                  <Button type="submit">Save</Button>
                </form>
              </DialogContent>
            </Dialog>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Word</TableHead>
                  <TableHead>Spoken form</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{e.word}</TableCell>
                    <TableCell className="text-slate">{e.spoken_form}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(e.id)}
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {entries.length === 0 && (
              <p className="text-body-sm text-slate">
                No entries yet. Add place names, character names, or tricky words.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
