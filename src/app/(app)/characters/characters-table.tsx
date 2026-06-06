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
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatAccentLabel } from "@/lib/elevenlabs/voice-accents";
import type { PenName, Series, CharacterRole } from "@/lib/types/database";
import {
  type LibraryCharacter,
  type CharacterSortKey,
  GENDER_LABELS,
  ROLE_LABELS,
  sortLibraryCharacters,
} from "@/lib/characters/character-library";

function tierBadgeVariant(
  role: CharacterRole
): "lead" | "main" | "narrator" | "side" | "guest" {
  switch (role) {
    case "protagonist":
      return "lead";
    case "series_regular":
      return "main";
    case "narrator":
      return "narrator";
    case "recurring":
      return "side";
    default:
      return "guest";
  }
}

export function CharactersTable({
  characters,
  penNames,
  series,
}: {
  characters: LibraryCharacter[];
  penNames: PenName[];
  series: Series[];
}) {
  const [penFilter, setPenFilter] = useState("all");
  const [seriesFilter, setSeriesFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");
  const [castFilter, setCastFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [hideGuests, setHideGuests] = useState(false);
  const [sortKey, setSortKey] = useState<CharacterSortKey>("priority");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = characters.filter((c) => {
      const s = c.series as Series | undefined;
      if (penFilter !== "all" && s?.pen_name_id !== penFilter) return false;
      if (seriesFilter !== "all" && c.series_id !== seriesFilter) return false;
      if (genderFilter !== "all" && c.gender !== genderFilter) return false;
      if (tierFilter !== "all" && c.effective_role !== tierFilter) return false;
      if (castFilter === "cast" && c.cast_status !== "cast") return false;
      if (castFilter === "needs_voice" && c.cast_status !== "needs_voice")
        return false;
      if (hideGuests && c.effective_role === "guest") return false;
      if (q) {
        const hay = [
          c.canonical_name,
          ...(c.aliases ?? []),
          c.elevenlabs_voice_name ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return sortLibraryCharacters(rows, sortKey);
  }, [
    characters,
    penFilter,
    seriesFilter,
    genderFilter,
    tierFilter,
    castFilter,
    hideGuests,
    search,
    sortKey,
  ]);

  const filteredSeries =
    penFilter === "all"
      ? series
      : series.filter((s) => s.pen_name_id === penFilter);

  const needsVoiceCount = characters.filter(
    (c) => c.cast_status === "needs_voice" && c.effective_role !== "narrator"
  ).length;

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <Label>Pen name</Label>
            <Select
              value={penFilter}
              onValueChange={(v) => {
                setPenFilter(v);
                setSeriesFilter("all");
              }}
            >
              <SelectTrigger className="w-44">
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
          <div>
            <Label>Tier</Label>
            <Select value={tierFilter} onValueChange={setTierFilter}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {(Object.keys(ROLE_LABELS) as CharacterRole[]).map((role) => (
                  <SelectItem key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Gender</Label>
            <Select value={genderFilter} onValueChange={setGenderFilter}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Cast</Label>
            <Select value={castFilter} onValueChange={setCastFilter}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="cast">Cast</SelectItem>
                <SelectItem value="needs_voice">Needs voice</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Sort</Label>
            <Select
              value={sortKey}
              onValueChange={(v) => setSortKey(v as CharacterSortKey)}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="priority">Priority</SelectItem>
                <SelectItem value="lines_desc">Most lines</SelectItem>
                <SelectItem value="lines_asc">Fewest lines</SelectItem>
                <SelectItem value="name">Name A–Z</SelectItem>
                <SelectItem value="gender">Gender</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[160px] flex-1">
            <Label>Search</Label>
            <Input
              placeholder="Name or alias…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-body-sm text-slate">
          <span>
            {filtered.length} of {characters.length} characters
          </span>
          {needsVoiceCount > 0 && (
            <span className="text-warning">
              {needsVoiceCount} need a voice
            </span>
          )}
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={hideGuests}
              onChange={(e) => setHideGuests(e.target.checked)}
              className="rounded border-border"
            />
            Hide walk-ons (guests)
          </label>
        </div>

        {filtered.length === 0 ? (
          <p className="py-8 text-center text-body-sm text-slate">
            No characters match these filters.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Character</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Gender</TableHead>
                <TableHead className="text-right">Lines</TableHead>
                <TableHead className="text-right">Books</TableHead>
                <TableHead>Cast</TableHead>
                <TableHead>Series</TableHead>
                <TableHead>Voice</TableHead>
                <TableHead>Accent</TableHead>
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
                    {(c.aliases?.length ?? 0) > 0 && (
                      <p className="mt-0.5 text-body-sm text-slate truncate max-w-[200px]">
                        aka {c.aliases.slice(0, 2).join(", ")}
                        {c.aliases.length > 2 ? "…" : ""}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={tierBadgeVariant(c.effective_role)}>
                      {c.tier_label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate tabular-nums">
                    {GENDER_LABELS[c.gender]}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-slate">
                    {c.total_lines > 0 ? c.total_lines.toLocaleString() : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-slate">
                    {c.book_count > 0 ? c.book_count : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        c.cast_status === "cast" ? "cast" : "needsVoice"
                      }
                    >
                      {c.cast_status === "cast" ? "Cast" : "Needs voice"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate">
                    {(c.series as { name?: string })?.name ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-[140px] truncate">
                    {c.elevenlabs_voice_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-slate max-w-[100px] truncate">
                    {c.voice_accent ? formatAccentLabel(c.voice_accent) : "—"}
                  </TableCell>
                  <TableCell className="text-slate max-w-[120px] truncate">
                    {c.voice_style ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
