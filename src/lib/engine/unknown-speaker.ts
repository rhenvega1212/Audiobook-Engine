/** Core Wine Lover's cast — never auto-deleted by cleanup. */
export const CANONICAL_CAST_NAMES = new Set([
  "Narrator",
  "Nikki Sands",
  "Derek Malveaux",
  "Isabel",
  "Susan",
  "Andres",
  "Pamela",
  "Jennifer",
  "Blake",
  "Marty",
]);

/** Common words / pronouns mis-parsed as speaker names by the rules engine. */
const BLOCKLIST = new Set([
  "actually",
  "americans",
  "antonio",
  "are",
  "aren",
  "as",
  "at",
  "because",
  "besides",
  "but",
  "caf",
  "did",
  "do",
  "fine",
  "from",
  "get it",
  "god",
  "good",
  "grapes",
  "had",
  "he",
  "hear",
  "hello",
  "hey",
  "hi",
  "his",
  "how",
  "inferno",
  "irish",
  "is",
  "isn",
  "it",
  "let",
  "like",
  "long",
  "looks",
  "maybe",
  "mr",
  "no",
  "now",
  "of",
  "oh",
  "okay",
  "on",
  "out",
  "remember",
  "right",
  "she",
  "somebody",
  "something",
  "sorry",
  "tell",
  "that",
  "the",
  "they",
  "this",
  "uh",
  "we",
  "well",
  "what",
  "whatever",
  "when",
  "where",
  "why",
  "won",
  "would",
  "yeah",
  "yep",
  "yes",
  "you",
  "unknown",
  "narrator",
]);

const MIN_LINES_FOR_NEW_CHARACTER = 2;

/** Looks like a proper name (capitalized word(s)), not a sentence fragment. */
function looksLikeProperName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length < 2) return false;
  if (!/^[A-Z]/.test(trimmed)) return false;
  if (/^(If|Did|When|Where|Why|How|What|Are|Is|Was|Were|Has|Have|Can|Could|Will|Would|Should)\s/i.test(trimmed)) {
    return false;
  }
  if (/[.!?]$/.test(trimmed)) return false;
  if (BLOCKLIST.has(trimmed.toLowerCase())) return false;
  const words = trimmed.split(/\s+/);
  if (words.length === 1 && words[0].length < 3) return false;
  return true;
}

/**
 * Whether an unknown speaker from the engine should become a series character row.
 */
export function isValidNewCharacter(name: string, lineCount: number): boolean {
  if (lineCount < MIN_LINES_FOR_NEW_CHARACTER) return false;
  if (!looksLikeProperName(name)) return false;
  if (CANONICAL_CAST_NAMES.has(name)) return false;
  return true;
}

export function isJunkCharacterName(name: string): boolean {
  if (CANONICAL_CAST_NAMES.has(name)) return false;
  return !looksLikeProperName(name);
}
