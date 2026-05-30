import { segmentParagraphByQuotes } from "@/lib/engine/quote-spans";
import { isDialogueTagOnly } from "@/lib/engine/rules-engine";

export type LineForAttributionTags = {
  id: string;
  line_order: number;
  paragraph_num: number;
  line_text: string;
};

function normalizeLineText(text: string): string {
  return text
    .trim()
    .replace(/^["'\u201C\u201D\u2018\u2019]+|["'\u201C\u201D\u2018\u2019]+$/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function linesMatch(a: string, b: string): boolean {
  return normalizeLineText(a) === normalizeLineText(b);
}

type IdealItem =
  | { kind: "dialogue"; text: string }
  | { kind: "tag"; text: string }
  | { kind: "narration"; text: string };

function idealSequence(source: string): IdealItem[] {
  const items: IdealItem[] = [];
  for (const seg of segmentParagraphByQuotes(source)) {
    const text = seg.text.trim();
    if (!text) continue;
    if (seg.kind === "dialogue") {
      items.push({ kind: "dialogue", text });
    } else if (isDialogueTagOnly(text)) {
      items.push({ kind: "tag", text });
    } else {
      items.push({ kind: "narration", text });
    }
  }
  return items;
}

/**
 * Speech tags from the Word source to show after a line when missing from stored lines.
 * Key = line id, value = tag text (e.g. "Nikki said.").
 */
export function buildAttributionTagsByLineId(
  lines: LineForAttributionTags[],
  sourceParagraphs?: string[]
): Map<string, string> {
  const result = new Map<string, string>();
  if (!sourceParagraphs?.length || lines.length === 0) return result;

  const byPara = new Map<number, LineForAttributionTags[]>();
  for (const line of lines) {
    if (line.paragraph_num == null || !Number.isFinite(line.paragraph_num)) {
      continue;
    }
    const bucket = byPara.get(line.paragraph_num) ?? [];
    bucket.push(line);
    byPara.set(line.paragraph_num, bucket);
  }

  for (const [paraNum, paraLines] of byPara) {
    const source = sourceParagraphs[paraNum]?.trim();
    if (!source) continue;

    const sorted = [...paraLines].sort((a, b) => a.line_order - b.line_order);
    const ideal = idealSequence(source);
    let lineIdx = 0;
    let lastMatchedId: string | null = null;

    for (const item of ideal) {
      if (item.kind === "dialogue") {
        while (lineIdx < sorted.length) {
          const candidate = sorted[lineIdx]!;
          if (linesMatch(candidate.line_text, item.text)) {
            lastMatchedId = candidate.id;
            lineIdx++;
            break;
          }
          lineIdx++;
        }
        continue;
      }

      if (item.kind === "tag") {
        const alreadyStored = sorted.some((l) => linesMatch(l.line_text, item.text));
        if (!alreadyStored && lastMatchedId) {
          result.set(lastMatchedId, item.text);
        }
      }
    }
  }

  return result;
}

export type MissingSpeechTagInsert = {
  paragraph_num: number;
  after_line_id: string;
  after_line_order: number;
  line_text: string;
};

/** Tags present in Word source but not yet stored as tagged_lines rows. */
export function findMissingSpeechTagInserts(
  lines: LineForAttributionTags[],
  sourceParagraphs: string[]
): MissingSpeechTagInsert[] {
  const tagMap = buildAttributionTagsByLineId(lines, sourceParagraphs);
  const inserts: MissingSpeechTagInsert[] = [];

  for (const [afterLineId, tagText] of tagMap) {
    const anchor = lines.find((l) => l.id === afterLineId);
    if (!anchor) continue;
    inserts.push({
      paragraph_num: anchor.paragraph_num,
      after_line_id: afterLineId,
      after_line_order: anchor.line_order,
      line_text: tagText,
    });
  }

  return inserts.sort((a, b) => b.after_line_order - a.after_line_order);
}
