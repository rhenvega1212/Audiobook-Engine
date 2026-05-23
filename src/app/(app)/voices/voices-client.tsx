"use client";

import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Voice {
  voice_id: string;
  name: string;
  labels?: Record<string, string>;
}

export function VoicesClient() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/voices")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setVoices(d.voices ?? []);
        setLoading(false);
      });
  }, []);

  if (loading) return <p className="text-slate">Loading voices…</p>;
  if (error) return <p className="text-danger">{error}</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Gender</TableHead>
          <TableHead>Accent</TableHead>
          <TableHead>Age</TableHead>
          <TableHead>ID</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {voices.map((v) => (
          <TableRow key={v.voice_id}>
            <TableCell className="font-medium">{v.name}</TableCell>
            <TableCell>{v.labels?.gender ?? "—"}</TableCell>
            <TableCell>{v.labels?.accent ?? "—"}</TableCell>
            <TableCell>{v.labels?.age ?? "—"}</TableCell>
            <TableCell className="font-mono text-body-sm text-slate">
              {v.voice_id.slice(0, 8)}…
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
