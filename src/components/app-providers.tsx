"use client";

import { Toaster } from "@/components/ui/sonner";
import { ChunkLoadRecovery } from "@/components/chunk-load-recovery";

export function AppProviders() {
  return (
    <>
      <ChunkLoadRecovery />
      <Toaster />
    </>
  );
}
