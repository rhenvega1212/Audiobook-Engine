"use client";

import { useCallback, useEffect, useState } from "react";
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
  COMMAND_LABELS,
  DEFAULT_HOTKEYS,
  detectBindingConflicts,
  formatHotkey,
  loadHotkeyConfig,
  resetHotkeyConfig,
  saveHotkeyConfig,
  type HotkeyBinding,
  type ManuscriptCommand,
  type ManuscriptHotkeyConfig,
} from "@/lib/manuscript/hotkeys";

export function ManuscriptHotkeysDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [config, setConfig] = useState<ManuscriptHotkeyConfig>(DEFAULT_HOTKEYS);
  const [recording, setRecording] = useState<ManuscriptCommand | null>(null);
  const [conflicts, setConflicts] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setConfig(loadHotkeyConfig());
      setConflicts([]);
      setRecording(null);
    }
  }, [open]);

  const onKeyCapture = useCallback(
    (e: KeyboardEvent) => {
      if (!recording) return;
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setRecording(null);
        return;
      }

      const binding: HotkeyBinding = {
        key: e.key.length === 1 ? e.key.toLowerCase() : e.key,
        modifiers: {
          meta: e.metaKey,
          ctrl: e.ctrlKey && !e.metaKey,
          shift: e.shiftKey,
          alt: e.altKey,
        },
      };

      const next = { ...config, [recording]: binding };
      setConfig(next);
      setConflicts(detectBindingConflicts(next));
      setRecording(null);
    },
    [config, recording]
  );

  useEffect(() => {
    if (!recording) return;
    window.addEventListener("keydown", onKeyCapture, true);
    return () => window.removeEventListener("keydown", onKeyCapture, true);
  }, [recording, onKeyCapture]);

  function handleSave() {
    const c = detectBindingConflicts(config);
    if (c.length > 0) {
      setConflicts(c);
      return;
    }
    saveHotkeyConfig(config);
    onOpenChange(false);
  }

  function handleReset() {
    const defaults = resetHotkeyConfig();
    setConfig(defaults);
    setConflicts([]);
  }

  const commands = Object.keys(COMMAND_LABELS) as ManuscriptCommand[];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manuscript shortcuts</DialogTitle>
          <DialogDescription>
            Click a shortcut to record a new key. Press Esc while recording to
            cancel. Changes apply to this browser only.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2">
          {commands.map((cmd) => (
            <li
              key={cmd}
              className="flex items-center justify-between gap-3 rounded-md border border-border-muted px-3 py-2"
            >
              <Label className="text-body-sm">{COMMAND_LABELS[cmd]}</Label>
              <Button
                type="button"
                size="sm"
                variant={recording === cmd ? "default" : "outline"}
                className="min-w-[5rem] font-mono text-xs"
                onClick={() => setRecording(cmd)}
              >
                {recording === cmd ? "Press key…" : formatHotkey(config[cmd])}
              </Button>
            </li>
          ))}
        </ul>

        {conflicts.length > 0 && (
          <div className="rounded-md bg-dark-red/10 px-3 py-2 text-body-sm text-dark-red">
            {conflicts.map((c) => (
              <p key={c}>{c}</p>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={handleReset}>
            Reset defaults
          </Button>
          <Button type="button" onClick={handleSave}>
            Save shortcuts
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
