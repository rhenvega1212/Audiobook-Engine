"use client";

import { Toaster as Sonner } from "sonner";

/** Client-only toast host for the root layout. */
export function Toaster() {
  return <Sonner position="top-right" richColors />;
}
