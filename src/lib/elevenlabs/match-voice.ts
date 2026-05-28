export type ElevenLabsVoice = { voice_id: string; name: string };

/** Alternate search terms when the seed hint is not a full ElevenLabs display name. */
const HINT_ALIASES: Record<string, string[]> = {
  janet: ["janet", "jessica", "sarah"],
  britney: ["britney", "brittany"],
  brittany: ["britney", "brittany"],
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function voiceTokens(voiceName: string): string[] {
  const n = normalize(voiceName);
  const primary = n.split(" - ")[0]?.trim() ?? n;
  return [n, primary, ...n.split(/\s*-\s*/).map((p) => p.trim())];
}

/**
 * Match an ElevenLabs voice by seed hint (e.g. "Eliza", "Adam") and optional style substring.
 */
export function matchElevenLabsVoice(
  hint: string,
  voices: ElevenLabsVoice[],
  styleHint?: string | null
): ElevenLabsVoice | undefined {
  const hintNorm = normalize(hint);
  const styleNorm = styleHint ? normalize(styleHint) : null;
  const searchTerms = [
    hintNorm,
    ...(HINT_ALIASES[hintNorm] ?? []),
  ];

  // 1. Exact full name match
  for (const v of voices) {
    if (normalize(v.name) === hintNorm) return v;
  }

  // 2. Style-qualified match (e.g. Adam + "Dominant, Firm")
  if (styleNorm) {
    for (const v of voices) {
      const vn = normalize(v.name);
      if (
        searchTerms.some((t) => vn.startsWith(t + " ") || vn.startsWith(t + " -")) &&
        vn.includes(styleNorm)
      ) {
        return v;
      }
    }
  }

  // 3. Voice display name starts with hint / hint is prefix of primary token
  for (const v of voices) {
    const tokens = voiceTokens(v.name);
    if (
      searchTerms.some(
        (t) =>
          tokens.some((tok) => tok === t || tok.startsWith(t + " ")) ||
          normalize(v.name).startsWith(t + " ")
      )
    ) {
      return v;
    }
  }

  // 4. Hint appears anywhere in voice name
  for (const v of voices) {
    const vn = normalize(v.name);
    if (searchTerms.some((t) => vn.includes(t))) return v;
  }

  return undefined;
}
