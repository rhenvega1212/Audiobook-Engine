export type PronunciationEntry = {
  word: string;
  spoken_form: string;
};

/** Escape special regex characters in a literal string */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Word-boundary match (case-insensitive) */
function wordBoundaryPattern(word: string): RegExp {
  return new RegExp(`\\b${escapeRegex(word)}\\b`, "gi");
}

/**
 * Apply series dictionary replacements. Longer phrases first to avoid partial swaps.
 */
export function applyPronunciations(
  text: string,
  entries: PronunciationEntry[]
): string {
  if (!text || entries.length === 0) return text;

  const sorted = [...entries].sort((a, b) => b.word.length - a.word.length);
  let result = text;
  for (const { word, spoken_form } of sorted) {
    if (!word.trim()) continue;
    result = result.replace(wordBoundaryPattern(word), spoken_form);
  }
  return result;
}

export type PronunciationMatch = {
  word: string;
  spoken_form: string;
  index: number;
};

/** Find dictionary hits in text for UI highlighting */
export function findPronunciationMatches(
  text: string,
  entries: PronunciationEntry[]
): PronunciationMatch[] {
  const matches: PronunciationMatch[] = [];
  const sorted = [...entries].sort((a, b) => b.word.length - a.word.length);

  for (const { word, spoken_form } of sorted) {
    const re = wordBoundaryPattern(word);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      matches.push({
        word: m[0],
        spoken_form,
        index: m.index,
      });
    }
  }

  return matches.sort((a, b) => a.index - b.index);
}

/** Final line text for ElevenLabs export */
export function resolveSpokenLine(
  lineText: string,
  spokenText: string | null | undefined,
  dictionary: PronunciationEntry[]
): string {
  const base = spokenText?.trim() ? spokenText : lineText;
  return applyPronunciations(base, dictionary);
}
