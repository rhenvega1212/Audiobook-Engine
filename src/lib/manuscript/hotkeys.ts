export type ManuscriptCommand =
  | "assignSpeaker"
  | "merge"
  | "delete"
  | "toggleExport"
  | "chapterStart"
  | "splitSelection"
  | "clearSelection"
  | "prevChapter"
  | "nextChapter"
  | "jumpLine"
  | "showHelp";

export type HotkeyBinding = {
  key: string;
  modifiers?: { meta?: boolean; ctrl?: boolean; shift?: boolean; alt?: boolean };
};

export type ManuscriptHotkeyConfig = Record<ManuscriptCommand, HotkeyBinding>;

export const DEFAULT_HOTKEYS: ManuscriptHotkeyConfig = {
  assignSpeaker: { key: "s" },
  merge: { key: "m" },
  delete: { key: "Delete" },
  toggleExport: { key: "e" },
  chapterStart: { key: "c" },
  splitSelection: { key: "x" },
  clearSelection: { key: "Escape" },
  prevChapter: { key: "[" },
  nextChapter: { key: "]" },
  jumpLine: { key: "j" },
  showHelp: { key: "?" },
};

export const COMMAND_LABELS: Record<ManuscriptCommand, string> = {
  assignSpeaker: "Assign speaker",
  merge: "Merge selected lines",
  delete: "Delete selected lines",
  toggleExport: "Toggle skip export",
  chapterStart: "Mark chapter start",
  splitSelection: "Split text selection",
  clearSelection: "Clear selection",
  prevChapter: "Previous chapter",
  nextChapter: "Next chapter",
  jumpLine: "Jump to line #",
  showHelp: "Show shortcuts",
};

const STORAGE_KEY = "manuscript-hotkeys-v1";

export function loadHotkeyConfig(): ManuscriptHotkeyConfig {
  if (typeof window === "undefined") return DEFAULT_HOTKEYS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_HOTKEYS;
    const parsed = JSON.parse(raw) as Partial<ManuscriptHotkeyConfig>;
    return { ...DEFAULT_HOTKEYS, ...parsed };
  } catch {
    return DEFAULT_HOTKEYS;
  }
}

export function saveHotkeyConfig(config: ManuscriptHotkeyConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function resetHotkeyConfig(): ManuscriptHotkeyConfig {
  localStorage.removeItem(STORAGE_KEY);
  return DEFAULT_HOTKEYS;
}

export function formatHotkey(binding: HotkeyBinding): string {
  const parts: string[] = [];
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.platform);

  if (binding.modifiers?.meta || binding.modifiers?.ctrl) {
    parts.push(isMac ? "⌘" : "Ctrl");
  }
  if (binding.modifiers?.alt) parts.push(isMac ? "⌥" : "Alt");
  if (binding.modifiers?.shift) parts.push("⇧");

  let key = binding.key;
  if (key === "Escape") key = "Esc";
  else if (key.length === 1) key = key.toUpperCase();
  parts.push(key);
  return parts.join(isMac ? "" : "+");
}

export function eventMatchesBinding(
  e: KeyboardEvent,
  binding: HotkeyBinding
): boolean {
  const mods = binding.modifiers ?? {};
  const wantMeta = !!(mods.meta || mods.ctrl);
  const hasMeta = e.metaKey || e.ctrlKey;
  if (wantMeta !== hasMeta) return false;
  if (!!mods.alt !== e.altKey) return false;
  if (!!mods.shift !== e.shiftKey) return false;

  const eventKey =
    e.key === "Backspace" && binding.key === "Delete" ? "Delete" : e.key;

  if (binding.key.length === 1 && !mods.shift) {
    return eventKey.toLowerCase() === binding.key.toLowerCase();
  }
  return eventKey === binding.key;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

export function findCommandForEvent(
  e: KeyboardEvent,
  config: ManuscriptHotkeyConfig
): ManuscriptCommand | null {
  for (const [command, binding] of Object.entries(config) as [
    ManuscriptCommand,
    HotkeyBinding,
  ][]) {
    if (eventMatchesBinding(e, binding)) return command;
  }
  return null;
}

export function detectBindingConflicts(
  config: ManuscriptHotkeyConfig
): string[] {
  const seen = new Map<string, ManuscriptCommand>();
  const conflicts: string[] = [];
  for (const [command, binding] of Object.entries(config) as [
    ManuscriptCommand,
    HotkeyBinding,
  ][]) {
    const id = JSON.stringify(binding);
    const other = seen.get(id);
    if (other) {
      conflicts.push(
        `${formatHotkey(binding)} used by both "${COMMAND_LABELS[other]}" and "${COMMAND_LABELS[command]}"`
      );
    } else {
      seen.set(id, command);
    }
  }
  return conflicts;
}
