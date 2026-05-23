import { DIALOGUE_VERBS_PATTERN } from "./vocabulary";

export const DIALOGUE_RE = /["“]([^"”]+?)["”]/g;
export const NAME_RE = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;

export const DIALOGUE_TAG_START_RE = new RegExp(
  `^\\s*(?:[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?|he|she|they|him|her|them)\\s+(?:${DIALOGUE_VERBS_PATTERN})\\b[^.!?,]*[.,]?`,
  "i"
);

export const CHAPTER_HEADING_RE =
  /^(CHAPTER|Chapter|PROLOGUE|EPILOGUE|\*\*\*|###)/;
