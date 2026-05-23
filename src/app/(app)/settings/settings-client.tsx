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
import { PronunciationsSection } from "@/components/pronunciation/pronunciations-section";
import type { PenName, Series } from "@/lib/types/database";

export function SettingsClient() {
  const [penNames, setPenNames] = useState<PenName[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [pnRes, sRes] = await Promise.all([
      fetch("/api/pen-names"),
      fetch("/api/series"),
    ]);
    setPenNames(await pnRes.json());
    setSeries(await sRes.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return <p className="text-slate">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <PenNamesSection penNames={penNames} onRefresh={load} />
      <SeriesSection
        penNames={penNames}
        series={series}
        onRefresh={load}
      />
      <PronunciationsSection series={series} />
    </div>
  );
}

function PenNamesSection({
  penNames,
  onRefresh,
}: {
  penNames: PenName[];
  onRefresh: () => void;
}) {
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/pen-names", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      toast.error("Failed to add pen name");
      return;
    }
    toast.success("Pen name added");
    setName("");
    setOpen(false);
    onRefresh();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Pen names</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">+ Add pen name</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New pen name</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4 pt-2">
              <div>
                <Label htmlFor="pn-name">Name</Label>
                <Input
                  id="pn-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Michele Scott"
                  required
                />
              </div>
              <Button type="submit">Save</Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {penNames.map((pn) => (
              <TableRow key={pn.id}>
                <TableCell>{pn.name}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function SeriesSection({
  penNames,
  series,
  onRefresh,
}: {
  penNames: PenName[];
  series: Series[];
  onRefresh: () => void;
}) {
  const [penNameId, setPenNameId] = useState("");
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/series", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pen_name_id: penNameId, name }),
    });
    if (!res.ok) {
      toast.error("Failed to add series");
      return;
    }
    toast.success("Series added");
    setName("");
    setPenNameId("");
    setOpen(false);
    onRefresh();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Series</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="secondary">
              + Add series
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New series</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4 pt-2">
              <div>
                <Label>Pen name</Label>
                <Select value={penNameId} onValueChange={setPenNameId} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select pen name" />
                  </SelectTrigger>
                  <SelectContent>
                    {penNames.map((pn) => (
                      <SelectItem key={pn.id} value={pn.id}>
                        {pn.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="s-name">Series name</Label>
                <Input
                  id="s-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Wine Lover's Mysteries"
                  required
                />
              </div>
              <Button type="submit">Save</Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Series</TableHead>
              <TableHead>Pen name</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {series.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{s.name}</TableCell>
                <TableCell className="text-slate">
                  {(s.pen_names as { name: string } | undefined)?.name ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
