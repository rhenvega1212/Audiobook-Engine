import type { EngineCharacter, ProcessResult, TaggedLine } from "./types";
import { NAME_RE, DIALOGUE_TAG_START_RE, CHAPTER_HEADING_RE, CHAPTER_NUMBER_RE } from "./regex";
import {
  DIALOGUE_VERBS,
  ACTION_TAG_VERBS,
  PRONOUN_GENDER,
} from "./vocabulary";
import { flagReasonForLine, type FlagContext } from "./flag-policy";
import { resolveFirstNameToCanonical } from "./resolve-first-name";
import { segmentParagraphByQuotes, type TextSegment } from "./quote-spans";

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

  const nameCandidates = [...attributionText.matchAll(NAME_RE)].map((m) => m[1]!);
  for (const candidate of nameCandidates) {
    const char = findCharacter(candidate, roster);
    if (char) {
      return [char.canonical_name, hasVerb ? "high" : "medium", false];
    }
    const byFirst = resolveFirstNameToCanonical(candidate, roster);
    if (byFirst) {
      return [byFirst.canonical_name, hasVerb ? "medium" : "medium", true];
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

  return {
    lines: allLines,
    unknown_speakers: [...detectedUnknownSpeakers].sort(),
    total_paragraphs: paragraphs.length,
    total_lines: allLines.length,
    flagged_count: allLines.filter((l) => l.flag_reason).length,
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
