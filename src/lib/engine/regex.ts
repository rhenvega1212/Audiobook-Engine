import { DIALOGUE_VERBS_PATTERN } from "./vocabulary";

export const DIALOGUE_RE = /["“]([^"”]+?)["”]/g;
export const NAME_RE = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;

// Covers both tag orders: "Nikki said." and the inverted "asked a man's
// voice from behind her." — English speech tags use either freely, and
// missing the inverted form left such narration undetected as a tag,
// so it never attached to the dialogue it belongs to.
export const DIALOGUE_TAG_START_RE = new RegExp(
  `^\\s*(?:` +
    `(?:[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?|he|she|they|him|her|them)\\s+(?:${DIALOGUE_VERBS_PATTERN})\\b[^.!?,]*[.,]?` +
    `|` +
    `(?:${DIALOGUE_VERBS_PATTERN})\\b\\s+[^.!?,]*[.,]?` +
    `)`,
  "i"
);

/** Line/paragraph starts a new chapter (import + studio navigation). */
export const CHAPTER_HEADING_RE =
  /^(?:CHAPTER|Chapter|Chap\.?|PROLOGUE|Prologue|EPILOGUE|Epilogue|PART\s+(?:[IVXLCDM]+|\d+)|BOOK\s+\d+|INTRODUCTION|Introduction|LAST CALL|Last Call|\*\*\*|#{1,3}\s*)/i;

/** Spelled-out or numeric chapter titles: "Chapter 1", "Chapter One", "Chapter 12: Title" */
export const CHAPTER_NUMBER_RE =
  /^chapter\s+(?:\d+|[a-z]+(?:-[a-z]+)?)(?:\s*[:.\u2013\u2014-]\s*|\s*$)/i;
