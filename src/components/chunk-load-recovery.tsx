"use client";

import { useEffect } from "react";

/** Reload once when a stale webpack chunk fails after a dev rebuild or deploy. */
export function ChunkLoadRecovery() {
  useEffect(() => {
    const reloadKey = "chunk-reload";

    function shouldReload(message: string) {
      return (
        message.includes("Loading chunk") ||
        message.includes("ChunkLoadError") ||
        message.includes("Failed to fetch dynamically imported module")
      );
    }

    function reloadOnce() {
      if (sessionStorage.getItem(reloadKey) === "1") return;
      sessionStorage.setItem(reloadKey, "1");
      window.location.reload();
    }

    function onRejection(event: PromiseRejectionEvent) {
      const reason = event.reason as { message?: string; name?: string } | undefined;
      const message = reason?.message ?? String(reason ?? "");
      if (reason?.name === "ChunkLoadError" || shouldReload(message)) {
        reloadOnce();
      }
    }

    function onError(event: ErrorEvent) {
      const message = event.message ?? "";
      if (shouldReload(message)) {
        reloadOnce();
      }
    }

    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    sessionStorage.removeItem(reloadKey);

    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  return null;
}
