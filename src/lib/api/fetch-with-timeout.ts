/**
 * fetch() that aborts after `timeoutMs` so a stalled request can never leave the
 * UI stuck in a "saving" state. Callers should treat an AbortError as a timeout
 * (see `isAbortError`) and surface a retry-able message.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 60000
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/** True when an error is the AbortError thrown by `fetchWithTimeout` on timeout. */
export function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

/** Normalizes an operation error into a user-facing message. */
export function operationErrorMessage(e: unknown, fallback: string): string {
  if (isAbortError(e)) {
    return `${fallback} timed out — check your connection and try again.`;
  }
  return e instanceof Error ? e.message : `${fallback} failed`;
}
