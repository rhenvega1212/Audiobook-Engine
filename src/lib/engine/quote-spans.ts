/** Quote and dialogue span parsing for safe line segmentation. */

export type TextSegmentKind = "narration" | "dialogue";

export type TextSegment = {
  kind: TextSegmentKind;
  text: string;
  /** Start offset in source paragraph (inclusive). */
  start: number;
  /** End offset in source paragraph (exclusive). */
  end: number;
};

type QuoteChar = '"' | "'" | "“" | "”" | "‘" | "’";

const OPENERS = new Set<QuoteChar>(['"', "'", "“", "‘"]);
const CLOSERS = new Map<QuoteChar, QuoteChar>([
  ['"', '"'],
  ["'", "'"],
  ["“", "”"],
  ["‘", "’"],
]);

function isWordChar(ch: string): boolean {
  return /[\w']/.test(ch);
}

/** Pair opener with expected closer (mixed styles allowed). */
function matchesCloser(opener: QuoteChar, ch: string): boolean {
  if (ch === CLOSERS.get(opener)) return true;
  if (opener === "“" && ch === '"') return true;
  if (opener === "”" && ch === '"') return true;
  if (opener === "‘" && ch === "'") return true;
  if (opener === "’" && ch === "'") return true;
  if (opener === '"' && (ch === "”" || ch === "“")) return true;
  if (opener === "'" && (ch === "’" || ch === "‘")) return true;
  return false;
}

export type QuoteSpan = { start: number; end: number };

/** Find quoted spans (content inside matching quote pairs). */
export function findQuoteSpans(text: string): QuoteSpan[] {
  const spans: QuoteSpan[] = [];
  let i = 0;

  while (i < text.length) {
    const ch = text[i] as QuoteChar;
    if (!OPENERS.has(ch)) {
      i++;
      continue;
    }

    const opener = ch;
    const contentStart = i + 1;
    let j = contentStart;
    let closed = false;

    while (j < text.length) {
      const c = text[j] as QuoteChar;
      if (matchesCloser(opener, c)) {
        // Apostrophe in contractions: don't treat as close when sandwiched in a word
        if (
          (c === "'" || c === "’" || c === "‘") &&
          j > 0 &&
          j + 1 < text.length &&
          isWordChar(text[j - 1]!) &&
          isWordChar(text[j + 1]!)
        ) {
          j++;
          continue;
        }
        spans.push({ start: i, end: j + 1 });
        i = j + 1;
        closed = true;
        break;
      }
      j++;
    }

    if (!closed) {
      i++;
    }
  }

  return spans;
}

/** True when [start, end) cuts through quoted dialogue without selecting all of it. */
export function isSplitInsideQuote(text: string, start: number, end: number): boolean {
  if (start < 0 || end > text.length || start >= end) return false;

  for (const span of findQuoteSpans(text)) {
    const innerStart = span.start + 1;
    const innerEnd = span.end - 1;
    if (innerEnd <= innerStart) continue;

    const overlaps = start < innerEnd && end > innerStart;
    const containsFull = start <= innerStart && end >= innerEnd;
    if (overlaps && !containsFull) return true;
  }
  return false;
}

/** Split a paragraph into narration / dialogue segments at quote boundaries. */
export function segmentParagraphByQuotes(text: string): TextSegment[] {
  const spans = findQuoteSpans(text);
  if (spans.length === 0) {
    return text.trim()
      ? [{ kind: "narration", text: text.trim(), start: 0, end: text.length }]
      : [];
  }

  const segments: TextSegment[] = [];
  let cursor = 0;

  for (const span of spans) {
    if (span.start > cursor) {
      const chunk = text.slice(cursor, span.start).trim();
      if (chunk) {
        segments.push({
          kind: "narration",
          text: chunk,
          start: cursor,
          end: span.start,
        });
      }
    }

    const quoted = text.slice(span.start, span.end);
    const inner = quoted.slice(1, -1).trim();
    if (inner) {
      segments.push({
        kind: "dialogue",
        text: inner,
        start: span.start,
        end: span.end,
      });
    }

    cursor = span.end;
  }

  if (cursor < text.length) {
    const trailing = text.slice(cursor).trim();
    if (trailing) {
      segments.push({
        kind: "narration",
        text: trailing,
        start: cursor,
        end: text.length,
      });
    }
  }

  return segments;
}

/** Rejoin segment texts — must equal source modulo whitespace collapse at joins. */
export function verifySegmentCoverage(
  source: string,
  segments: { text: string }[]
): boolean {
  const normalize = (s: string) =>
    s
      .replace(/\s+/g, " ")
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      .trim();

  const joined = normalize(segments.map((s) => s.text).join(" "));
  const src = normalize(source.replace(/^["“]|["”]$/g, (m, i, str) => m));
  // Compare word tokens for robustness
  const words = (t: string) => t.toLowerCase().match(/[\w']+/g) ?? [];
  const a = words(joined);
  const b = words(source);
  if (b.length === 0) return true;
  let hits = 0;
  const used = new Set<number>();
  for (const w of b) {
    for (let i = 0; i < a.length; i++) {
      if (!used.has(i) && a[i] === w) {
        used.add(i);
        hits++;
        break;
      }
    }
  }
  return hits / b.length >= 0.98;
}
