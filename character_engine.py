"""
Character Detection & Dialogue Attribution Engine — v2
========================================================
Fixes from v1:
  1. Strip dialogue-tag fragments from dialogue lines (trailing commas, etc.)
  2. Smarter back-and-forth attribution (track conversation participants,
     alternate speakers when context suggests it)
  3. Extract attribution clauses from narration so they don't leak through

Algorithm overview:
  Step 1: Split manuscript into paragraphs
  Step 2: For each paragraph, identify dialogue spans and surrounding text
  Step 3: For each dialogue span:
            a) Look for explicit attribution (named character + verb)
            b) Look for pronoun attribution → resolve via recent speakers
            c) Detect conversation alternation pattern (Derek/Marty back-and-forth)
            d) Fall back to last speaker if all else fails
  Step 4: For each non-dialogue span:
            a) Strip the attribution clause if present (e.g. "Derek said,")
            b) Emit remaining narration as Narrator
"""

import re
from dataclasses import dataclass, field
from typing import Optional


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class Character:
    canonical_name: str
    aliases: list[str] = field(default_factory=list)
    gender: str = "unknown"

    def matches(self, name: str) -> bool:
        name_lower = name.lower().strip()
        if name_lower == self.canonical_name.lower():
            return True
        return name_lower in [a.lower() for a in self.aliases]


@dataclass
class TaggedLine:
    speaker: str
    line: str
    paragraph_num: int
    confidence: str
    flag_reason: Optional[str] = None


# ---------------------------------------------------------------------------
# Vocabulary
# ---------------------------------------------------------------------------

DIALOGUE_VERBS = {
    "said", "says", "asked", "asks", "replied", "replies", "answered", "answers",
    "told", "tells", "responded", "responds", "added", "adds",
    "whispered", "whispers", "murmured", "murmurs", "muttered", "mutters",
    "shouted", "shouts", "yelled", "yells", "called", "calls",
    "hissed", "hisses", "shrieked", "shrieks",
    "groaned", "groans", "sighed", "sighs", "laughed", "laughs", "giggled",
    "snapped", "snaps", "snarled", "snarls", "growled", "growls",
    "exclaimed", "exclaims", "demanded", "demands", "insisted", "insists",
    "protested", "protests", "agreed", "agrees", "admitted", "admits",
    "confessed", "confesses", "explained", "explains", "continued", "continues",
    "began", "begins", "started", "starts", "finished", "finishes",
    "interrupted", "interrupts", "stammered", "stammers",
    "breathed", "breathes", "warned", "warns", "promised", "promises",
    "cried", "cries", "sobbed", "sobs", "moaned", "moans",
    "chuckled", "chuckles", "smirked", "smirks", "scoffed", "scoffs",
    "wondered", "wonders", "mused", "muses", "remarked", "remarks",
    "stated", "states", "announced", "announces", "declared", "declares",
    "offered", "offers", "suggested", "suggests", "noted", "notes",
    "observed", "observes", "ordered", "orders", "commanded", "commands",
    "pleaded", "pleads", "begged", "begs", "argued", "argues",
}

# Action verbs that often follow dialogue without "said" (Michele uses these)
ACTION_TAG_VERBS = {
    "smiled", "frowned", "nodded", "shrugged", "laughed", "sighed",
    "groaned", "winced", "blinked", "grinned",
}

PRONOUN_GENDER = {
    "he": "male", "him": "male", "his": "male",
    "she": "female", "her": "female", "hers": "female",
    "they": "unknown", "them": "unknown",
}


# ---------------------------------------------------------------------------
# Regex
# ---------------------------------------------------------------------------

DIALOGUE_RE = re.compile(r'["“]([^"”]+?)["”]')
NAME_RE = re.compile(r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b')

# Match a dialogue tag at the START of a narration fragment:
#   "Derek said, not looking up" → "Derek said," is the tag, rest is action
#   "Nikki groaned." → entire thing is a tag
#   "she replied with a smile." → entire thing is a tag
DIALOGUE_TAG_START_RE = re.compile(
    r'^\s*(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?|he|she|they|him|her|them)'
    r'\s+(?:' + '|'.join(DIALOGUE_VERBS) + r')\b'
    r'[^.!?,]*[.,]?',
    re.IGNORECASE
)


# ---------------------------------------------------------------------------
# Core helpers
# ---------------------------------------------------------------------------

def find_character(name: str, roster: list[Character]) -> Optional[Character]:
    for char in roster:
        if char.matches(name):
            return char
    return None


def clean_dialogue_line(text: str) -> str:
    """Clean trailing/leading punctuation artifacts from a dialogue line."""
    text = text.strip()
    # Strip trailing comma (dialogue-tag artifact)
    if text.endswith(","):
        text = text[:-1].rstrip()
    # If the line ended without final punctuation, add a period
    if text and text[-1] not in ".!?…—-":
        text += "."
    return text


def strip_dialogue_tag(narration: str) -> str:
    """
    Remove a dialogue tag from the start of a narration fragment.

    Examples:
      "Derek said, not looking up from his task." → "Not looking up from his task."
      "Nikki groaned." → ""
      "Isabel replied with a smile." → ""
      "She glanced between them." → "She glanced between them." (no tag verb)
    """
    narration = narration.strip()
    if not narration:
        return ""

    # Does this start with a dialogue tag?
    match = DIALOGUE_TAG_START_RE.match(narration)
    if not match:
        return narration

    # Remove the tag portion
    remainder = narration[match.end():].strip()

    # Tidy: if remainder starts with lowercase, capitalize the first letter
    # (since we just chopped off the leading clause)
    if remainder and remainder[0].islower():
        remainder = remainder[0].upper() + remainder[1:]

    return remainder


def extract_speaker_from_attribution(
    attribution_text: str,
    roster: list[Character],
    last_named_speakers: dict[str, str],
    conversation_participants: list[str],
) -> tuple[Optional[str], str]:
    """
    Identify the speaker from the text surrounding a quote.

    Returns (canonical_name, confidence).
    """
    if not attribution_text.strip():
        return (None, "none")

    text_lower = attribution_text.lower()
    words = re.findall(r"\b[\w']+\b", text_lower)
    has_dialogue_verb = any(w in DIALOGUE_VERBS for w in words)
    has_action_verb = any(w in ACTION_TAG_VERBS for w in words)
    has_verb = has_dialogue_verb or has_action_verb

    # 1) Named character + verb = highest confidence
    name_candidates = NAME_RE.findall(attribution_text)
    for candidate in name_candidates:
        char = find_character(candidate, roster)
        if char:
            return (char.canonical_name, "high" if has_verb else "medium")

    # 2) Pronoun + verb = medium-low (depends on gender resolution)
    for pronoun, gender in PRONOUN_GENDER.items():
        if re.search(rf"\b{pronoun}\b", text_lower) and has_verb:
            last = last_named_speakers.get(gender)
            if last:
                return (last, "low")
            return (None, "low")

    return (None, "none")


def split_paragraph_into_lines(
    paragraph: str,
    para_num: int,
    roster: list[Character],
    last_named_speakers: dict[str, str],
    conversation_participants: list[str],
) -> list[TaggedLine]:
    """Split a paragraph into attributed lines."""
    results: list[TaggedLine] = []
    matches = list(DIALOGUE_RE.finditer(paragraph))

    if not matches:
        text = paragraph.strip()
        if text:
            results.append(TaggedLine(
                speaker="Narrator",
                line=text,
                paragraph_num=para_num,
                confidence="high"
            ))
        return results

    cursor = 0
    for idx, match in enumerate(matches):
        pre_text = paragraph[cursor:match.start()].strip()
        next_start = matches[idx + 1].start() if idx + 1 < len(matches) else len(paragraph)
        post_text = paragraph[match.end():next_start].strip()

        # Attribute the dialogue using surrounding context
        attribution_context = (pre_text + " " + post_text).strip()
        speaker, confidence = extract_speaker_from_attribution(
            attribution_context, roster, last_named_speakers, conversation_participants
        )

        # Emit narration BEFORE this dialogue (with tag stripped)
        if pre_text:
            cleaned = strip_dialogue_tag(pre_text)
            if cleaned:
                results.append(TaggedLine(
                    speaker="Narrator",
                    line=cleaned,
                    paragraph_num=para_num,
                    confidence="high"
                ))

        # Emit the dialogue
        dialogue_text = clean_dialogue_line(match.group(1))
        flag = None

        if speaker is None:
            # Unattributed — try back-and-forth conversation pattern
            if len(conversation_participants) == 2:
                # Two-party conversation: speaker is the OTHER participant
                last_speaker = conversation_participants[-1]
                speaker = next(
                    (p for p in conversation_participants if p != last_speaker),
                    last_speaker
                )
                confidence = "low"
                flag = "unattributed_back_and_forth_inferred"
            elif conversation_participants:
                speaker = conversation_participants[-1]
                confidence = "low"
                flag = "unattributed_dialogue_inferred_from_context"
            else:
                speaker = "UNKNOWN"
                confidence = "none"
                flag = "unattributed_dialogue_no_context"
        elif confidence == "low":
            flag = "pronoun_only_attribution"

        results.append(TaggedLine(
            speaker=speaker,
            line=dialogue_text,
            paragraph_num=para_num,
            confidence=confidence,
            flag_reason=flag
        ))

        cursor = match.end()

    # Trailing narration AFTER the final quote
    trailing = paragraph[cursor:].strip()
    if trailing:
        cleaned = strip_dialogue_tag(trailing)
        if cleaned:
            results.append(TaggedLine(
                speaker="Narrator",
                line=cleaned,
                paragraph_num=para_num,
                confidence="high"
            ))

    return results


def process_manuscript(text: str, roster: list[Character]) -> dict:
    """Process a full manuscript end to end."""
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]

    all_lines: list[TaggedLine] = []
    detected_unknown_speakers: set[str] = set()
    last_named_speakers: dict[str, str] = {}
    # Track who's currently in the conversation (resets on scene changes)
    conversation_participants: list[str] = []

    for i, para in enumerate(paragraphs):
        # Chapter headings reset conversation
        if re.match(r'^(CHAPTER|Chapter|PROLOGUE|EPILOGUE|\*\*\*|###)', para):
            all_lines.append(TaggedLine(
                speaker="Narrator",
                line=para,
                paragraph_num=i,
                confidence="high"
            ))
            conversation_participants = []
            last_named_speakers = {}
            continue

        lines = split_paragraph_into_lines(
            para, i, roster, last_named_speakers, conversation_participants
        )

        # Update speaker memory from this paragraph
        for line in lines:
            if line.speaker not in ("Narrator", "UNKNOWN"):
                # Update conversation participants (most-recent-last)
                if line.speaker in conversation_participants:
                    conversation_participants.remove(line.speaker)
                conversation_participants.append(line.speaker)
                # Cap at 2 active participants for back-and-forth detection
                # (when a third joins, the oldest drops)
                if len(conversation_participants) > 3:
                    conversation_participants = conversation_participants[-3:]

                # Update gender→name memory if confidence is decent
                if line.confidence in ("high", "medium"):
                    char = find_character(line.speaker, roster)
                    if char and char.gender in ("male", "female"):
                        last_named_speakers[char.gender] = line.speaker
            elif line.speaker == "UNKNOWN":
                candidates = NAME_RE.findall(line.line)
                for c in candidates:
                    if not find_character(c, roster):
                        detected_unknown_speakers.add(c)

        all_lines.extend(lines)

    return {
        "lines": all_lines,
        "unknown_speakers": sorted(detected_unknown_speakers),
        "total_paragraphs": len(paragraphs),
        "total_lines": len(all_lines),
        "flagged_count": sum(1 for l in all_lines if l.flag_reason),
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    roster = [
        Character("Nikki Sands", ["Nikki", "Sands", "Ms. Sands"], "female"),
        Character("Derek Malveaux", ["Derek", "Malveaux", "Mr. Malveaux"], "male"),
        Character("Isabel", ["Isabel"], "female"),
        Character("Susan", ["Susan"], "female"),
        Character("Andres", ["Andres"], "male"),
        Character("Pamela", ["Pamela"], "female"),
        Character("Jennifer", ["Jennifer"], "female"),
        Character("Blake", ["Blake"], "male"),
        Character("Marty", ["Marty"], "male"),
    ]

    with open("/home/claude/sample_manuscript.txt") as f:
        text = f.read()

    result = process_manuscript(text, roster)

    print(f"=" * 70)
    print(f"PROCESSING REPORT — v2")
    print(f"=" * 70)
    print(f"Total paragraphs: {result['total_paragraphs']}")
    print(f"Total output lines: {result['total_lines']}")
    print(f"Flagged for review: {result['flagged_count']}")
    print(f"Unknown speakers: {result['unknown_speakers']}")
    print()

    from collections import Counter
    counts = Counter(l.speaker for l in result['lines'])
    print(f"LINE COUNTS BY SPEAKER:")
    for speaker, count in counts.most_common():
        print(f"  {speaker:25s} {count:4d} lines")
    print()

    print(f"=" * 70)
    print(f"TAGGED OUTPUT")
    print(f"=" * 70)
    for line in result['lines']:
        flag = f"  [⚠ {line.flag_reason}]" if line.flag_reason else ""
        conf = "" if line.confidence == "high" else f"  ({line.confidence})"
        print(f"[{line.speaker}]{conf}{flag}")
        preview = line.line[:120] + ("..." if len(line.line) > 120 else "")
        print(f"  {preview}")
        print()
