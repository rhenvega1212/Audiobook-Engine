"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { Card, CardContent } from "@/components/ui/card";
import type { PenName, Series } from "@/lib/types/database";

export function NewBookForm({
  penNames,
  series: allSeries,
}: {
  penNames: PenName[];
  series: Series[];
}) {
  const router = useRouter();
  const [penNameId, setPenNameId] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const filteredSeries = penNameId
    ? allSeries.filter((s) => s.pen_name_id === penNameId)
    : allSeries;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !seriesId || !title) return;

    setLoading(true);
    const formData = new FormData();
    formData.append("series_id", seriesId);
    formData.append("title", title);
    formData.append("file", file);

    const res = await fetch("/api/books", { method: "POST", body: formData });
    setLoading(false);

    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error ?? "Upload failed");
      return;
    }

    const data = await res.json();
    toast.success("Book uploaded and analysis started");
    router.push(`/books/${data.id ?? data.book?.id}`);
    router.refresh();
  }

  return (
    <Card className="max-w-xl">
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Pen name</Label>
            <Select value={penNameId} onValueChange={(v) => { setPenNameId(v); setSeriesId(""); }}>
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
            <Label>Series</Label>
            <Select value={seriesId} onValueChange={setSeriesId} disabled={!penNameId}>
              <SelectTrigger>
                <SelectValue placeholder="Select series" />
              </SelectTrigger>
              <SelectContent>
                {filteredSeries.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="title">Book title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Murder by the Glass"
              required
            />
          </div>

          <div>
            <Label htmlFor="file">Manuscript (.docx)</Label>
            <Input
              id="file"
              type="file"
              accept=".docx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
            />
          </div>

          <Button type="submit" disabled={loading}>
            {loading ? "Uploading…" : "Upload & analyze"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
