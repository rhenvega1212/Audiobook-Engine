"use client";

import { cn } from "@/lib/utils";

export function Slider({
  id,
  label,
  value,
  min,
  max,
  step = 0.01,
  hint,
  onChange,
  className,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  hint?: string;
  onChange: (value: number) => void;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-body-sm text-ink">
          {label}
        </label>
        <span className="font-mono text-[11px] text-slate tabular-nums">
          {value.toFixed(2)}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer accent-teal"
      />
      {hint ? <p className="text-[11px] text-slate">{hint}</p> : null}
    </div>
  );
}
