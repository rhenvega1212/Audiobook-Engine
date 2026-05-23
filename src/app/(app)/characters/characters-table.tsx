"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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
import { Label } from "@/components/ui/label";
import type { Character, PenName, Series } from "@/lib/types/database";

export function CharactersTable({
  characters,
  penNames,
  series,
}: {
  characters: Character[];
  penNames: PenName[];
  series: Series[];
}) {
  const [penFilter, setPenFilter] = useState("all");
  const [seriesFilter, setSeriesFilter] = useState("all");

  const filtered = useMemo(() => {
    return characters.filter((c) => {
      const s = c.series as Series | undefined;
      if (penFilter !== "all" && s?.pen_name_id !== penFilter) return false;
      if (seriesFilter !== "all" && c.series_id !== seriesFilter) return false;
      return true;
    });
  }, [characters, penFilter, seriesFilter]);

  const filteredSeries = penFilter === "all"
    ? series
    : series.filter((s) => s.pen_name_id === penFilter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        <div>
          <Label>Pen name</Label>
          <Select value={penFilter} onValueChange={(v) => { setPenFilter(v); setSeriesFilter("all"); }}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {penNames.map((pn) => (
                <SelectItem key={pn.id} value={pn.id}>
                  {pn.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Series</Label>
          <Select value={seriesFilter} onValueChange={setSeriesFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {filteredSeries.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Character</TableHead>
            <TableHead>Series</TableHead>
            <TableHead>Voice</TableHead>
            <TableHead>Style</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                <Link
                  href={`/characters/${c.id}`}
                  className="font-serif text-teal hover:underline"
                >
                  {c.canonical_name}
                </Link>
              </TableCell>
              <TableCell className="text-slate">
                {(c.series as { name?: string })?.name ?? "—"}
              </TableCell>
              <TableCell>{c.elevenlabs_voice_name ?? "—"}</TableCell>
              <TableCell className="text-slate">{c.voice_style ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
