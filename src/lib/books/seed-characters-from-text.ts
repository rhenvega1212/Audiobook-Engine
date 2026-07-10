import { NAME_RE, CHAPTER_HEADING_RE, CHAPTER_NUMBER_RE } from "@/lib/engine/regex";
import { isSeedableCharacterName } from "@/lib/engine/unknown-speaker";

const SCENE_BREAK_RE =
  /^(\*{3,}|-{3,}|#{1,3}\s|(?:scene|Scene)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b)/;

/** Extra false positives when harvesting names from narration (not dialogue tags). */
const MENTION_BLOCKLIST = new Set([
  "chapter",
  "prologue",
  "epilogue",
  "part",
  "book",
  "introduction",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "agenda",
  "street",
  "avenue",
  "boulevard",
  "city",
  "county",
  "state",
  "america",
  "american",
  "english",
  "french",
  "spanish",
]);

function skipParagraph(para: string): boolean {
  return (
    CHAPTER_HEADING_RE.test(para) ||
    CHAPTER_NUMBER_RE.test(para) ||
    SCENE_BREAK_RE.test(para)
  );
}

/**
 * Harvest capitalized proper names mentioned anywhere in the manuscript.
 * Aggressive by design: seed the roster first, let rules + AI assign lines later.
 * Returns name → mention count (deduped case-insensitively, canonical casing
 * from first occurrence).
 */
export function extractMentionedNames(paragraphs: string[]): Map<string, number> {
  const byLower = new Map<string, { name: string; count: number }>();

  for (const para of paragraphs) {
    if (skipParagraph(para)) continue;

    const seenInPara = new Set<string>();
    for (const m of para.matchAll(NAME_RE)) {
      const name = m[1]!.trim();
      if (!isSeedableCharacterName(name)) continue;
      if (MENTION_BLOCKLIST.has(name.toLowerCase())) continue;

      const key = name.toLowerCase();
      if (seenInPara.has(key)) continue;
      seenInPara.add(key);

      const entry = byLower.get(key);
      if (entry) {
        entry.count += 1;
      } else {
        byLower.set(key, { name, count: 1 });
      }
    }
  }

  const out = new Map<string, number>();
  for (const { name, count } of byLower.values()) {
    out.set(name, count);
  }
  return out;
}
