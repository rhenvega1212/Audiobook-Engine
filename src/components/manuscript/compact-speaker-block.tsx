"use client";

import type { ReactNode } from "react";

export function CompactSpeakerBlock({
  speakerLabel,
  lineRange,
  excluded,
  flagged,
  voiceName,
  headerActions,
  onBodyClick,
  children,
}: {
  speakerLabel: string;
  lineRange: string;
  excluded?: boolean;
  flagged?: boolean;
  voiceName?: string | null;
  headerActions?: ReactNode;
  onBodyClick?: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 mb-3 ${
        excluded
          ? "border-slate/30 bg-slate/5 opacity-75"
          : flagged
            ? "border-warning/40 bg-warning/5"
            : "border-border-muted bg-warm-sand/30"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
        <span className="text-xs font-medium uppercase tracking-wider text-burgundy">
          {speakerLabel}
        </span>
        <span className="text-[10px] text-slate tabular-nums">{lineRange}</span>
        {voiceName && (
          <span className="text-[10px] text-teal truncate max-w-[12rem]">
            {voiceName}
          </span>
        )}
        {excluded && (
          <span className="text-[10px] text-slate uppercase">Skipped in export</span>
        )}
        {headerActions && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {headerActions}
          </div>
        )}
      </div>
      <div
        role={onBodyClick ? "button" : undefined}
        tabIndex={onBodyClick ? 0 : undefined}
        onClick={onBodyClick}
        onKeyDown={
          onBodyClick
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onBodyClick();
                }
              }
            : undefined
        }
        className={`font-serif text-sm whitespace-pre-wrap break-words ${
          onBodyClick ? "cursor-pointer" : ""
        } ${excluded ? "line-through text-slate" : "text-ink"}`}
      >
        {children}
      </div>
    </div>
  );
}
