export type ProgressTickerStop = () => void;

const PREVIEW_WAIT_MESSAGES = [
  "Connecting to Claude…",
  "Reading scenes from your Word file…",
  "Matching speakers to dialogue…",
  "Cross-checking your original manuscript…",
  "Analyzing scene context and speech tags…",
  "Still working — large chapters can take a minute…",
];

const APPLY_WAIT_MESSAGES = [
  "Connecting to Claude…",
  "Reviewing flagged lines…",
  "Applying speaker assignments…",
  "Cross-checking scene context…",
  "Still working — almost there…",
];

function messageForElapsed(
  elapsedMs: number,
  batch: number,
  messages: string[]
): string {
  const step = Math.min(
    messages.length - 1,
    Math.floor(elapsedMs / 4500)
  );
  const base = messages[step] ?? messages[messages.length - 1]!;
  if (batch <= 1) return base;
  return base.replace(/…$/, "") + ` (batch ${batch})…`;
}

/** Smoothly advance progress while waiting on a long Claude API call. */
export function startAiReviewProgressTicker(
  onTick: (progress: number, message: string) => void,
  options: {
    floor: number;
    ceiling: number;
    batch?: number;
    mode?: "preview" | "apply";
    intervalMs?: number;
  }
): ProgressTickerStop {
  const batch = options.batch ?? 1;
  const messages =
    options.mode === "apply" ? APPLY_WAIT_MESSAGES : PREVIEW_WAIT_MESSAGES;
  const intervalMs = options.intervalMs ?? 450;
  const started = Date.now();
  let current = options.floor;

  onTick(Math.round(current), messageForElapsed(0, batch, messages));

  const interval = setInterval(() => {
    const elapsed = Date.now() - started;
    const remaining = options.ceiling - current;

    if (remaining > 0.25) {
      const bump = Math.max(0.35, Math.min(remaining * 0.07, 2.2));
      current = Math.min(options.ceiling, current + bump);
    }

    onTick(Math.round(current), messageForElapsed(elapsed, batch, messages));
  }, intervalMs);

  return () => clearInterval(interval);
}
