"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  buildIssueContext,
  pageLabelFromPath,
} from "@/lib/issues/types";

export function ReportIssueButton() {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const context = useMemo(() => {
    if (!open || typeof window === "undefined") return null;
    return buildIssueContext();
  }, [open]);

  const pageLabel = useMemo(() => {
    if (!context) return "App";
    return pageLabelFromPath(context.pathname);
  }, [context]);

  const setScreenshotFile = useCallback((file: File | null) => {
    setScreenshot(file);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!open) {
      setDescription("");
      setScreenshotFile(null);
    }
  }, [open, setScreenshotFile]);

  useEffect(() => {
    if (!open) return;

    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (!item.type.startsWith("image/")) continue;
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          setScreenshotFile(file);
          return;
        }
      }
    }

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open, setScreenshotFile]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!context) return;

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.set("description", description.trim());
      formData.set("page_url", window.location.href);
      formData.set("page_label", pageLabel);
      formData.set("context", JSON.stringify(context));
      formData.set("screenshot", screenshot!);

      const res = await fetch("/api/issues", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "Could not send report");
      }

      toast.success("Report sent — thank you!");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send report");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        size="lg"
        className="fixed bottom-6 right-6 z-40 h-12 rounded-full shadow-lg gap-2 px-4 bg-burgundy hover:bg-dark-red"
        onClick={() => setOpen(true)}
        aria-label="Report an issue"
      >
        <Camera className="h-4 w-4 shrink-0" />
        <span className="hidden sm:inline">Report issue</span>
      </Button>

      <Dialog open={open} onOpenChange={(o) => !submitting && setOpen(o)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Report an issue</DialogTitle>
            <DialogDescription>
              Attach a screenshot and tell us what went wrong. We&apos;ll capture
              where you were in the app automatically.
            </DialogDescription>
          </DialogHeader>

          {context && (
            <div className="rounded-md border border-border-muted bg-warm-sand/40 px-3 py-2 text-body-sm text-slate space-y-1">
              <p>
                <span className="text-ink font-medium">{pageLabel}</span>
                {context.book_id && (
                  <span className="text-slate"> · book {context.book_id.slice(0, 8)}…</span>
                )}
              </p>
              <p className="truncate text-xs">{window.location.pathname}{context.search}</p>
              <p className="text-xs">
                {context.viewport} · {new Date(context.captured_at).toLocaleString()}
              </p>
            </div>
          )}

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="issue-description">What happened?</Label>
              <textarea
                id="issue-description"
                required
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What were you trying to do? What did you expect vs what you saw?"
                className="flex w-full rounded-md border border-border bg-bone px-3 py-2 text-sm text-ink placeholder:text-slate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/30"
              />
            </div>

            <div className="space-y-2">
              <Label>Screenshot</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setScreenshotFile(file);
                }}
              />
              {previewUrl ? (
                <div className="relative rounded-md border border-border overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="Screenshot preview"
                    className="max-h-48 w-full object-contain bg-warm-sand/30"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="absolute top-2 right-2 h-8"
                    onClick={() => {
                      setScreenshotFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Upload image
                  </Button>
                  <span className="text-body-sm text-slate self-center">
                    or paste (Cmd+V)
                  </span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                disabled={submitting}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || !screenshot}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Sending…
                  </>
                ) : (
                  "Send report"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
