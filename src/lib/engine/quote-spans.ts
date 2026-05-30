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

export function isWrappedInQuotes(text: string): boolean {
  const t = text.trim();
  if (t.length < 2) return false;
  const first = t[0] as QuoteChar;
  const last = t[t.length - 1]!;
  return OPENERS.has(first) && matchesCloser(first, last);
}

/** Remove one pair of outer quote marks (for TTS — voices should not read them). */
export function stripOuterQuotes(text: string): string {
  const t = text.trim();
  if (!isWrappedInQuotes(t)) return text;
  const inner = t.slice(1, -1).trim();
  return inner || text;
}

/** Wrap spoken dialogue in quotes when missing (fallback when source docx unavailable). */
export function wrapInQuotes(text: string, opener: QuoteChar = "\u201C"): string {
  const t = text.trim();
  if (!t || isWrappedInQuotes(t)) return t;
  const closer =
    opener === "\u201C" ? "\u201D" : (CLOSERS.get(opener) ?? opener);
  return `${opener}${t}${closer}`;
}

export function formatLineForManuscript(
  text: string,
  speakerLabel: string
): string {
  if (speakerLabel === "Narrator") return text.trim();
  return wrapInQuotes(text);
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

    const quoted = text.slice(span.start, span.end).trim();
    if (quoted.length >= 2) {
      segments.push({
        kind: "dialogue",
        text: quoted,
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
