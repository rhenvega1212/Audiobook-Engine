"use client";

import { useState } from "react";
import { VoiceBrowser } from "@/components/voice-browser";

export function VoicesClient() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="max-w-3xl">
      <p className="text-body-sm text-slate mb-4">
        Search voices in your ElevenLabs account or browse the public library to
        import new ones. Imported voices appear under My voices and can be
        assigned to characters.
      </p>
      <VoiceBrowser
        selectedId={selectedId}
        onSelect={setSelectedId}
        genderDefault="all"
      />
    </div>
  );
}
