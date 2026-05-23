import type { EngineCharacter, ProcessResult, TaggedLine } from "./types";
import { DIALOGUE_RE, NAME_RE, DIALOGUE_TAG_START_RE, CHAPTER_HEADING_RE } from "./regex";
import {
  DIALOGUE_VERBS,
  ACTION_TAG_VERBS,
  PRONOUN_GENDER,
} from "./vocabulary";

function findCharacter(
  name: string,
  roster: EngineCharacter[]
): EngineCharacter | undefined {
  return roster.find((c) => c.matches(name));
}

export function cleanDialogueLine(text: string): string {
  let t = text.trim();
  if (t.endsWith(",")) {
    t = t.slice(0, -1).trimEnd();
  }
  if (t && !/[.!?…—-]$/.test(t)) {
    t += ".";
  }
  return t;
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

function extractSpeakerFromAttribution(
  attributionText: string,
  roster: EngineCharacter[],
  lastNamedSpeakers: Record<string, string>
): [string | null, TaggedLine["confidence"]] {
  if (!attributionText.trim()) return [null, "none"];

  const textLower = attributionText.toLowerCase();
  const words = textLower.match(/\b[\w']+\b/g) ?? [];
  const hasDialogueVerb = words.some((w) => DIALOGUE_VERBS.has(w));
  const hasActionVerb = words.some((w) => ACTION_TAG_VERBS.has(w));
  const hasVerb = hasDialogueVerb || hasActionVerb;

  const nameCandidates = [...attributionText.matchAll(NAME_RE)].map((m) => m[1]);
  for (const candidate of nameCandidates) {
    const char = findCharacter(candidate, roster);
    if (char) {
      return [char.canonical_name, hasVerb ? "high" : "medium"];
    }
  }

  for (const [pronoun, gender] of Object.entries(PRONOUN_GENDER)) {
    if (new RegExp(`\\b${pronoun}\\b`).test(textLower) && hasVerb) {
      const last = lastNamedSpeakers[gender];
      if (last) return [last, "low"];
      return [null, "low"];
    }
  }

  return [null, "none"];
}

function splitParagraphIntoLines(
  paragraph: string,
  paraNum: number,
  roster: EngineCharacter[],
  lastNamedSpeakers: Record<string, string>,
  conversationParticipants: string[]
): TaggedLine[] {
  const results: TaggedLine[] = [];
  const matches = [...paragraph.matchAll(DIALOGUE_RE)];

  if (matches.length === 0) {
    const text = paragraph.trim();
    if (text) {
      results.push({
        speaker: "Narrator",
        line: text,
        paragraph_num: paraNum,
        confidence: "high",
        flag_reason: null,
      });
    }
    return results;
  }

  let cursor = 0;
  for (let idx = 0; idx < matches.length; idx++) {
    const match = matches[idx];
    const preText = paragraph.slice(cursor, match.index!).trim();
    const nextStart =
      idx + 1 < matches.length ? matches[idx + 1].index! : paragraph.length;
    const postText = paragraph.slice(match.index! + match[0].length, nextStart).trim();

    const attributionContext = (preText + " " + postText).trim();
    let [speaker, confidence] = extractSpeakerFromAttribution(
      attributionContext,
      roster,
      lastNamedSpeakers
    );

    if (preText) {
      const cleaned = stripDialogueTag(preText);
      if (cleaned) {
        results.push({
          speaker: "Narrator",
          line: cleaned,
          paragraph_num: paraNum,
          confidence: "high",
          flag_reason: null,
        });
      }
    }

    const dialogueText = cleanDialogueLine(match[1]);
    let flag: string | null = null;

    if (speaker === null) {
      if (conversationParticipants.length === 2) {
        const lastSpeaker =
          conversationParticipants[conversationParticipants.length - 1];
        speaker =
          conversationParticipants.find((p) => p !== lastSpeaker) ?? lastSpeaker;
        confidence = "low";
        flag = "unattributed_back_and_forth_inferred";
      } else if (conversationParticipants.length > 0) {
        speaker = conversationParticipants[conversationParticipants.length - 1];
        confidence = "low";
        flag = "unattributed_dialogue_inferred_from_context";
      } else {
        speaker = "UNKNOWN";
        confidence = "none";
        flag = "unattributed_dialogue_no_context";
      }
    } else if (confidence === "low") {
      flag = "pronoun_only_attribution";
    }

    results.push({
      speaker,
      line: dialogueText,
      paragraph_num: paraNum,
      confidence,
      flag_reason: flag,
    });

    cursor = match.index! + match[0].length;
  }

  const trailing = paragraph.slice(cursor).trim();
  if (trailing) {
    const cleaned = stripDialogueTag(trailing);
    if (cleaned) {
      results.push({
        speaker: "Narrator",
        line: cleaned,
        paragraph_num: paraNum,
        confidence: "high",
        flag_reason: null,
      });
    }
  }

  return results;
}

export function processManuscript(
  text: string,
  roster: EngineCharacter[]
): ProcessResult {
  const paragraphs = text
    .split("\n\n")
    .map((p) => p.trim())
    .filter(Boolean);

  const allLines: TaggedLine[] = [];
  const detectedUnknownSpeakers = new Set<string>();
  let lastNamedSpeakers: Record<string, string> = {};
  let conversationParticipants: string[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];

    if (CHAPTER_HEADING_RE.test(para)) {
      allLines.push({
        speaker: "Narrator",
        line: para,
        paragraph_num: i,
        confidence: "high",
        flag_reason: null,
      });
      conversationParticipants = [];
      lastNamedSpeakers = {};
      continue;
    }

    const lines = splitParagraphIntoLines(
      para,
      i,
      roster,
      lastNamedSpeakers,
      conversationParticipants
    );

    for (const line of lines) {
      if (line.speaker !== "Narrator" && line.speaker !== "UNKNOWN") {
        const idx = conversationParticipants.indexOf(line.speaker);
        if (idx >= 0) conversationParticipants.splice(idx, 1);
        conversationParticipants.push(line.speaker);
        if (conversationParticipants.length > 3) {
          conversationParticipants = conversationParticipants.slice(-3);
        }

        if (line.confidence === "high" || line.confidence === "medium") {
          const char = findCharacter(line.speaker, roster);
          if (char && (char.gender === "male" || char.gender === "female")) {
            lastNamedSpeakers[char.gender] = line.speaker;
          }
        }
      } else if (line.speaker === "UNKNOWN") {
        for (const m of line.line.matchAll(NAME_RE)) {
          if (!findCharacter(m[1], roster)) {
            detectedUnknownSpeakers.add(m[1]);
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
