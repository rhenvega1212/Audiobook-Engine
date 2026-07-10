import type { EngineCharacter, ProcessResult, TaggedLine } from "./types";
import { NAME_RE, DIALOGUE_TAG_START_RE, CHAPTER_HEADING_RE, CHAPTER_NUMBER_RE } from "./regex";
import { DIALOGUE_VERBS, ACTION_TAG_VERBS, PRONOUN_GENDER, DIALOGUE_VERBS_PATTERN, ACTION_TAG_VERBS_PATTERN } from "./vocabulary";
import { flagReasonForLine, type FlagContext } from "./flag-policy";
import { resolveFirstNameToCanonical } from "./resolve-first-name";
import { segmentParagraphByQuotes, type TextSegment } from "./quote-spans";
import { isJunkCharacterName } from "./unknown-speaker";

function findCharacter(
  name: string,
  roster: EngineCharacter[]
): EngineCharacter | undefined {
  return roster.find((c) => c.matches(name));
}

/** Preserve dialogue text verbatim — no auto-punctuation. */
export function cleanDialogueLine(text: string): string {
  return text.trim();
}

export function stripDialogueTag(narration: string): string {
  let n = narration.trim();
  if (!n) return "";

  const match = DIALOGUE_TAG_START_RE.exec(n);
  if (!match) return narration;

  let remainder = n.slice(match[0].length).trim();
  if (remainder && remainder[0] === remainder[0].toLowerCase()) {
    remainder = remainder[0].toUpperCase() + remainder.slice(1);
  }
  return remainder;
}

/** True when narration is only a speech tag (e.g. "Nikki said."). */
export function isDialogueTagOnly(text: string): boolean {
  const raw = text.trim();
  if (!raw) return false;
  return stripDialogueTag(raw).trim() === "";
}

function stripQuotedSpansForAttribution(text: string): string {
  return text
    .replace(/["'\u201C][^"'\u201D]*["'\u201D]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameAppearsWithDialogueVerb(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `\\b${escaped}\\b\\s+(?:\\w+\\s+){0,3}(?:${DIALOGUE_VERBS_PATTERN})\\b|` +
      `\\b(?:${DIALOGUE_VERBS_PATTERN})\\b\\s*[,]?\\s*\\b${escaped}\\b`,
    "i"
  );
  return pattern.test(text);
}

function nameAppearsWithActionBeat(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `\\b${escaped}\\b\\s+(?:\\w+\\s+){0,4}(?:${ACTION_TAG_VERBS_PATTERN})\\b`,
    "i"
  );
  return pattern.test(text);
}

/** True when a name sits in a speech tag or action beat — not bare narration. */
export function nameAppearsInCharacterContext(text: string, name: string): boolean {
  return (
    nameAppearsWithDialogueVerb(text, name) ||
    nameAppearsWithActionBeat(text, name)
  );
}

function extractSpeakerFromAttribution(
  attributionText: string,
  roster: EngineCharacter[],
  lastNamedSpeakers: Record<string, string>
): [string | null, TaggedLine["confidence"], boolean] {
  if (!attributionText.trim()) return [null, "none", false];

  const textLower = attributionText.toLowerCase();
  const words = textLower.match(/\b[\w']+\b/g) ?? [];
  const hasDialogueVerb = words.some((w) => DIALOGUE_VERBS.has(w));
  const hasActionVerb = words.some((w) => ACTION_TAG_VERBS.has(w));
  const hasVerb = hasDialogueVerb || hasActionVerb;

  const attributionForNames = stripQuotedSpansForAttribution(attributionText);
  const nameCandidates = [
    ...attributionForNames.matchAll(NAME_RE),
  ].map((m) => m[1]!);

  for (const candidate of nameCandidates) {
    const char = findCharacter(candidate, roster);
    if (char) {
      if (!nameAppearsInCharacterContext(attributionForNames, candidate)) {
        continue;
      }
      return [char.canonical_name, "high", false];
    }
    const byFirst = resolveFirstNameToCanonical(candidate, roster);
    if (byFirst) {
      if (!nameAppearsInCharacterContext(attributionForNames, candidate)) {
        continue;
      }
      return [byFirst.canonical_name, "medium", true];
    }
  }

  for (const [pronoun, gender] of Object.entries(PRONOUN_GENDER)) {
    if (new RegExp(`\\b${pronoun}\\b`).test(textLower) && hasVerb) {
      const last = lastNamedSpeakers[gender];
      if (last) return [last, "low", false];
      return [null, "low", false];
    }
  }

  return [null, "none", false];
}

function emitNarration(
  text: string,
  paraNum: number,
  results: TaggedLine[],
  stripTags = true
): void {
  const raw = text.trim();
  if (!raw) return;
  if (stripTags) {
    const remainder = stripDialogueTag(raw);
    if (!remainder.trim()) {
      results.push({
        speaker: "Narrator",
        line: raw,
        paragraph_num: paraNum,
        confidence: "high",
        flag_reason: null,
      });
      return;
    }
    results.push({
      speaker: "Narrator",
      line: remainder.trim(),
      paragraph_num: paraNum,
      confidence: "high",
      flag_reason: null,
    });
    return;
  }
  results.push({
    speaker: "Narrator",
    line: raw,
    paragraph_num: paraNum,
    confidence: "high",
    flag_reason: null,
  });
}

function attributionForDialogue(
  segments: TextSegment[],
  dialogueIndex: number,
  paragraph: string
): string {
  const seg = segments[dialogueIndex]!;
  const after = paragraph.slice(seg.end).trim();
  const before = paragraph.slice(0, seg.start).trim();

  const afterTag = after.match(
    /^[,.\s]*(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?|he|she|they|him|her|them)\s+(?:\w+\s+){0,3}(?:said|asked|replied|whispered|shouted|murmured|added|continued|exclaimed)/i
  );
  if (afterTag) return afterTag[0].trim();

  const beforeTag = before.match(
    /(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?|he|she|they)\s+(?:\w+\s+){0,3}(?:said|asked|replied|whispered|shouted|murmured|added|continued|exclaimed)[,.\s]*$/i
  );
  if (beforeTag) return beforeTag[0].trim();

  if (dialogueIndex + 1 < segments.length) {
    const between = paragraph.slice(seg.end, segments[dialogueIndex + 1]!.start).trim();
    if (between) return between;
  }

  return (before + " " + after).trim();
}

function inferSpeaker(
  speaker: string | null,
  confidence: TaggedLine["confidence"],
  firstNameOnlyMatch: boolean,
  conversationParticipants: string[],
  recentDialogueCount: number
): {
  speaker: string;
  confidence: TaggedLine["confidence"];
  inferenceKind: FlagContext["inferenceKind"];
  firstNameOnlyMatch: boolean;
} {
  if (speaker !== null) {
    return {
      speaker,
      confidence,
      inferenceKind: confidence === "low" ? "pronoun" : "none",
      firstNameOnlyMatch,
    };
  }

  if (
    conversationParticipants.length === 2 &&
    recentDialogueCount >= 1
  ) {
    const lastSpeaker =
      conversationParticipants[conversationParticipants.length - 1]!;
    return {
      speaker:
        conversationParticipants.find((p) => p !== lastSpeaker) ?? lastSpeaker,
      confidence: "low",
      inferenceKind: "back_and_forth",
      firstNameOnlyMatch: false,
    };
  }

  if (conversationParticipants.length > 0 && recentDialogueCount >= 2) {
    return {
      speaker: conversationParticipants[conversationParticipants.length - 1]!,
      confidence: "low",
      inferenceKind: "last_speaker",
      firstNameOnlyMatch: false,
    };
  }

  return {
    speaker: "UNKNOWN",
    confidence: "none",
    inferenceKind: "no_context",
    firstNameOnlyMatch: false,
  };
}

function splitParagraphIntoLines(
  paragraph: string,
  paraNum: number,
  roster: EngineCharacter[],
  lastNamedSpeakers: Record<string, string>,
  conversationParticipants: string[],
  recentDialogueCount: number
): TaggedLine[] {
  const results: TaggedLine[] = [];
  const segments = segmentParagraphByQuotes(paragraph);

  if (segments.length === 0) {
    emitNarration(paragraph, paraNum, results);
    return results;
  }

  let dialogueIdx = 0;
  for (const seg of segments) {
    if (seg.kind === "narration") {
      emitNarration(seg.text, paraNum, results, true);
      continue;
    }

    const attributionContext = attributionForDialogue(
      segments,
      dialogueIdx,
      paragraph
    );
    dialogueIdx++;

    let [speaker, confidence, firstNameOnlyMatch] = extractSpeakerFromAttribution(
      attributionContext,
      roster,
      lastNamedSpeakers
    );

    const inferred = inferSpeaker(
      speaker,
      confidence,
      firstNameOnlyMatch,
      conversationParticipants,
      recentDialogueCount
    );
    speaker = inferred.speaker;
    confidence = inferred.confidence;
    firstNameOnlyMatch = inferred.firstNameOnlyMatch;

    const dialogueText = cleanDialogueLine(seg.text);

    const rosterResolved =
      speaker === "Narrator" ||
      speaker === "UNKNOWN" ||
      !!findCharacter(speaker, roster);

    const flag = flagReasonForLine({
      speaker,
      confidence,
      rosterResolved,
      firstNameOnlyMatch,
      inferenceKind: inferred.inferenceKind,
    });

    results.push({
      speaker,
      line: dialogueText,
      paragraph_num: paraNum,
      confidence,
      flag_reason: flag,
    });
  }

  return results;
}

const SCENE_BREAK_RE =
  /^(\*{3,}|-{3,}|#{1,3}\s|(?:scene|Scene)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b)/;

const NARRATOR = "Narrator";

/**
 * Cap on the length of a coalesced narrator line. Consecutive narrator rows are
 * merged into one clip for smoother TTS cadence, but a single ElevenLabs request
 * has an upper bound (~2500 chars), so we stop merging before we risk producing
 * a request the TTS provider will reject. Pronunciation overrides can expand the
 * spoken text, so we leave headroom.
 */
const MAX_MERGED_NARRATOR_CHARS = 2000;

/**
 * Merge runs of consecutive Narrator lines into a single line so text-to-speech
 * renders them as one continuous clip. Back-to-back narrator rows otherwise each
 * become an independent TTS generation with its own intonation and a hard seam
 * between clips, which is the "choppy cadence" heard on playback.
 *
 * Rules:
 * - Only adjacent lines both labeled "Narrator" are merged.
 * - Chapter/scene headings (`block_boundary`) are never merged and break a run.
 * - Pieces from the same source paragraph join with a space; pieces from
 *   different paragraphs join with a blank line so the narrator still pauses
 *   between paragraphs.
 * - Merging stops before `MAX_MERGED_NARRATOR_CHARS` to stay within TTS limits.
 */
function coalesceNarratorRuns(lines: TaggedLine[]): TaggedLine[] {
  const out: TaggedLine[] = [];

  for (const line of lines) {
    const prev = out[out.length - 1];
    const canMerge =
      prev !== undefined &&
      prev.speaker === NARRATOR &&
      line.speaker === NARRATOR &&
      !prev.block_boundary &&
      !line.block_boundary;

    if (canMerge) {
      const separator = line.paragraph_num !== prev!.paragraph_num ? "\n\n" : " ";
      const combined = `${prev!.line.trim()}${separator}${line.line.trim()}`;
      if (combined.length <= MAX_MERGED_NARRATOR_CHARS) {
        prev!.line = combined;
        prev!.flag_reason = prev!.flag_reason ?? line.flag_reason;
        continue;
      }
    }

    out.push({ ...line });
  }

  return out;
}

/**
 * High-recall name sweep: every capitalized proper name that appears in the
 * manuscript (2+ times), with its mention count, minus obvious junk (common
 * words, sentence openers on the blocklist). This is the "collect every name"
 * stage — deliberately over-inclusive; the AI cast-discovery step decides which
 * are real speaking characters. Returned most-frequent first, capped to `limit`.
 */
export function extractNameCandidates(
  paragraphs: string[],
  limit = 80
): { name: string; count: number }[] {
  const counts = new Map<string, number>();

  for (const para of paragraphs) {
    if (
      CHAPTER_HEADING_RE.test(para) ||
      CHAPTER_NUMBER_RE.test(para) ||
      SCENE_BREAK_RE.test(para)
    ) {
      continue;
    }
    for (const m of para.matchAll(NAME_RE)) {
      const name = m[1]!.trim();
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .filter(([name, count]) => count >= 2 && !isJunkCharacterName(name))
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Scan paragraphs for names that appear in character context — speech tags
 * (`Lina said`) or action beats (`Lina shook her head`) — not bare mentions in
 * narration. Used to seed the roster before attribution.
 */
export function detectCharacterContextCandidates(
  paragraphs: string[]
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const para of paragraphs) {
    if (
      CHAPTER_HEADING_RE.test(para) ||
      CHAPTER_NUMBER_RE.test(para) ||
      SCENE_BREAK_RE.test(para)
    ) {
      continue;
    }

    // Strip quoted dialogue so names *inside* speech don't seed false characters.
    const narration = stripQuotedSpansForAttribution(para);
    const seen = new Set<string>();
    for (const m of narration.matchAll(NAME_RE)) {
      const name = m[1]!;
      if (seen.has(name)) continue;
      seen.add(name);
      if (nameAppearsInCharacterContext(narration, name)) {
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }

    // Also check tight attribution windows beside quotes.
    const segments = segmentParagraphByQuotes(para);
    if (segments.length === 0) continue;

    let dialogueIdx = 0;
    for (const seg of segments) {
      if (seg.kind === "narration") continue;
      const attributionContext = attributionForDialogue(
        segments,
        dialogueIdx,
        para
      );
      dialogueIdx++;

      const attributionForNames =
        stripQuotedSpansForAttribution(attributionContext);
      for (const m of attributionForNames.matchAll(NAME_RE)) {
        const name = m[1]!;
        if (nameAppearsInCharacterContext(attributionForNames, name)) {
          counts.set(name, (counts.get(name) ?? 0) + 1);
        }
      }
    }
  }

  return counts;
}

/** @deprecated Use detectCharacterContextCandidates */
export function detectSpeakerCandidates(
  paragraphs: string[]
): Map<string, number> {
  return detectCharacterContextCandidates(paragraphs);
}

export function processManuscriptFromParagraphs(
  paragraphs: string[],
  roster: EngineCharacter[]
): ProcessResult {
  const allLines: TaggedLine[] = [];
  const detectedUnknownSpeakers = new Set<string>();
  let lastNamedSpeakers: Record<string, string> = {};
  let conversationParticipants: string[] = [];
  let recentDialogueCount = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i]!;

    if (
      CHAPTER_HEADING_RE.test(para) ||
      CHAPTER_NUMBER_RE.test(para) ||
      SCENE_BREAK_RE.test(para)
    ) {
      allLines.push({
        speaker: "Narrator",
        line: para,
        paragraph_num: i,
        confidence: "high",
        flag_reason: null,
        block_boundary: true,
      });
      conversationParticipants = [];
      lastNamedSpeakers = {};
      recentDialogueCount = 0;
      continue;
    }

    const lines = splitParagraphIntoLines(
      para,
      i,
      roster,
      lastNamedSpeakers,
      conversationParticipants,
      recentDialogueCount
    );

    for (const line of lines) {
      if (line.speaker !== "Narrator" && line.speaker !== "UNKNOWN") {
        const idx = conversationParticipants.indexOf(line.speaker);
        if (idx >= 0) conversationParticipants.splice(idx, 1);
        conversationParticipants.push(line.speaker);
        if (conversationParticipants.length > 3) {
          conversationParticipants = conversationParticipants.slice(-3);
        }
        recentDialogueCount++;

        if (line.confidence === "high" || line.confidence === "medium") {
          const char = findCharacter(line.speaker, roster);
          if (char && (char.gender === "male" || char.gender === "female")) {
            lastNamedSpeakers[char.gender] = line.speaker;
          }
        }
      } else if (line.speaker === "Narrator") {
        recentDialogueCount = 0;
      } else if (line.speaker === "UNKNOWN") {
        for (const m of line.line.matchAll(NAME_RE)) {
          if (!findCharacter(m[1]!, roster)) {
            detectedUnknownSpeakers.add(m[1]!);
          }
        }
      }
    }

    allLines.push(...lines);
  }

  const lines = coalesceNarratorRuns(allLines);

  return {
    lines,
    unknown_speakers: [...detectedUnknownSpeakers].sort(),
    total_paragraphs: paragraphs.length,
    total_lines: lines.length,
    flagged_count: lines.filter((l) => l.flag_reason).length,
  };
}

export function processManuscript(
  text: string,
  roster: EngineCharacter[]
): ProcessResult {
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return processManuscriptFromParagraphs(paragraphs, roster);
}
