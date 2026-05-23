"""
AI-Assisted Attribution Module
================================
Second-pass attribution: takes the rules-engine output and uses Claude to
resolve flagged lines.

Strategy:
  1. Take tagged lines from the rules engine
  2. Group flagged lines into "scenes" (chunks between chapter breaks or
     large narration blocks)
  3. For each scene with flagged lines, send Claude the full scene context
     and the character roster, asking it to confirm attributions
  4. Parse Claude's response and update the tagged lines

This is designed to be called AFTER the rules engine has done its first pass.
"""

import json
import re
from dataclasses import dataclass, asdict
from typing import Optional

# Note: in production this imports anthropic SDK; for testing we use a stub
# from anthropic import Anthropic


@dataclass
class SceneChunk:
    """A scene of dialogue + narration with some flagged lines needing review."""
    scene_id: int
    start_line: int
    end_line: int
    has_flags: bool


def group_lines_into_scenes(tagged_lines: list) -> list[SceneChunk]:
    """
    Split the tagged-line stream into scenes.

    A scene break is:
      - A chapter heading (CHAPTER X)
      - A scene divider (***, ###, ---)
      - A run of 3+ consecutive narrator lines (signals scene transition)
    """
    scenes = []
    scene_start = 0
    consecutive_narrator = 0
    SCENE_BREAK_NARRATOR_RUN = 3

    for i, line in enumerate(tagged_lines):
        is_chapter = (
            line.speaker == "Narrator"
            and re.match(r'^(CHAPTER|Chapter|PROLOGUE|EPILOGUE|\*\*\*|###|---)', line.line.strip())
        )

        if line.speaker == "Narrator":
            consecutive_narrator += 1
        else:
            consecutive_narrator = 0

        is_scene_break = (
            is_chapter
            or consecutive_narrator >= SCENE_BREAK_NARRATOR_RUN
        )

        if is_scene_break and i > scene_start:
            # Close out the previous scene
            scene_lines = tagged_lines[scene_start:i]
            scenes.append(SceneChunk(
                scene_id=len(scenes),
                start_line=scene_start,
                end_line=i,
                has_flags=any(l.flag_reason for l in scene_lines),
            ))
            scene_start = i

    # Final scene
    if scene_start < len(tagged_lines):
        scene_lines = tagged_lines[scene_start:]
        scenes.append(SceneChunk(
            scene_id=len(scenes),
            start_line=scene_start,
            end_line=len(tagged_lines),
            has_flags=any(l.flag_reason for l in scene_lines),
        ))

    return scenes


def build_attribution_prompt(
    scene_lines: list,
    roster: list,
    flagged_indices: list[int],
) -> str:
    """
    Build the prompt sent to Claude to resolve flagged lines in a scene.

    Returns a single string prompt asking Claude to return JSON.
    """
    roster_text = "\n".join(
        f"- {c.canonical_name} ({c.gender}) — also known as: {', '.join(c.aliases)}"
        for c in roster
    )

    scene_text = ""
    for i, line in enumerate(scene_lines):
        marker = "  ⚠ NEEDS REVIEW" if i in flagged_indices else ""
        scene_text += f"[{i}] [{line.speaker}] {line.line}{marker}\n"

    prompt = f"""You are an expert at attributing dialogue to characters in a novel.

CHARACTER ROSTER:
{roster_text}

SCENE (with current attributions):
{scene_text}

Lines marked "⚠ NEEDS REVIEW" had ambiguous attribution from the rules engine.
Review the FULL scene context and determine the correct speaker for each one.

Important rules:
- "Narrator" is correct for non-dialogue (descriptive text)
- Use exact canonical names from the roster (e.g. "Nikki Sands" not "Nikki")
- If you cannot determine the speaker with confidence, return "UNKNOWN"
- Consider conversation flow: in a 2-person dialogue, speakers usually alternate
- Watch for scene transitions where new characters arrive

Return ONLY a JSON object in this exact format, with no additional text:
{{
  "attributions": [
    {{"line_index": 0, "speaker": "Nikki Sands", "confidence": "high"}},
    ...
  ]
}}

Only include line indices that were marked NEEDS REVIEW. Confidence should be
"high", "medium", or "low" based on how certain you are."""

    return prompt


def call_claude_for_attribution(prompt: str, client=None) -> dict:
    """
    Send the prompt to Claude and parse the response.

    In production, this uses the Anthropic SDK. For local testing without
    a real API key, we use a stub that simulates plausible output.
    """
    if client is None:
        # Stub for local testing — returns a mock response
        return _stub_claude_response(prompt)

    response = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
    )

    text = response.content[0].text.strip()
    # Strip markdown code fences if present
    text = re.sub(r'^```(?:json)?\s*', '', text)
    text = re.sub(r'\s*```$', '', text)

    return json.loads(text)


def _stub_claude_response(prompt: str) -> dict:
    """
    Stub that mimics what Claude would return.

    For demonstration: it looks at the lines and applies basic heuristics
    a real LLM would handle well (e.g. "after Blake appeared, Blake speaks next").

    DO NOT use this in production. This is purely for proving the architecture
    works end-to-end without burning real API credits during testing.
    """
    # Parse the scene out of the prompt to find flagged line indices
    lines_section = prompt.split("SCENE (with current attributions):")[1]
    lines_section = lines_section.split("Lines marked")[0]

    attributions = []

    # Look for lines with NEEDS REVIEW marker
    for match in re.finditer(r'\[(\d+)\] \[([^\]]+)\] (.+?)  ⚠ NEEDS REVIEW', lines_section):
        idx = int(match.group(1))
        current_speaker = match.group(2)

        # Stub logic: assume the current attribution is roughly right but
        # in production Claude would do real reasoning. For demonstration,
        # we'll just preserve whatever the rules engine guessed but mark
        # confidence as "medium" (i.e. we "reviewed" it).
        attributions.append({
            "line_index": idx,
            "speaker": current_speaker,  # In real use, Claude would correct this
            "confidence": "medium",  # Bumped up because "Claude" reviewed
        })

    return {"attributions": attributions}


def run_ai_assisted_pass(tagged_lines: list, roster: list, client=None) -> dict:
    """
    Main entry point: take rules-engine output and run AI-assisted second pass.

    Returns updated tagged_lines + stats.
    """
    scenes = group_lines_into_scenes(tagged_lines)
    scenes_processed = 0
    lines_updated = 0
    api_calls = 0

    for scene in scenes:
        if not scene.has_flags:
            continue

        scene_lines = tagged_lines[scene.start_line:scene.end_line]
        flagged_indices = [
            i for i, l in enumerate(scene_lines) if l.flag_reason
        ]

        if not flagged_indices:
            continue

        prompt = build_attribution_prompt(scene_lines, roster, flagged_indices)

        try:
            response = call_claude_for_attribution(prompt, client=client)
            api_calls += 1
        except Exception as e:
            print(f"⚠ AI attribution failed for scene {scene.scene_id}: {e}")
            continue

        # Apply Claude's attributions back to the tagged lines
        for attr in response.get("attributions", []):
            local_idx = attr["line_index"]
            global_idx = scene.start_line + local_idx
            if 0 <= global_idx < len(tagged_lines):
                old_speaker = tagged_lines[global_idx].speaker
                new_speaker = attr["speaker"]
                tagged_lines[global_idx].speaker = new_speaker
                tagged_lines[global_idx].confidence = attr.get("confidence", "medium")
                # Keep the flag for transparency but mark it as AI-reviewed
                tagged_lines[global_idx].flag_reason = (
                    f"ai_reviewed (was: {tagged_lines[global_idx].flag_reason}; "
                    f"changed: {old_speaker} → {new_speaker})"
                    if old_speaker != new_speaker
                    else f"ai_confirmed (was: {tagged_lines[global_idx].flag_reason})"
                )
                if old_speaker != new_speaker:
                    lines_updated += 1

        scenes_processed += 1

    return {
        "lines": tagged_lines,
        "scenes_total": len(scenes),
        "scenes_processed": scenes_processed,
        "lines_updated": lines_updated,
        "api_calls": api_calls,
    }


# ---------------------------------------------------------------------------
# Main — runs the full pipeline (rules engine → AI second pass)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Import the rules engine
    from character_engine_v2 import (
        Character, process_manuscript
    )

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

    # Pass 1: rules engine
    print("=" * 70)
    print("PASS 1: Rules Engine")
    print("=" * 70)
    result = process_manuscript(text, roster)
    print(f"  Total lines: {result['total_lines']}")
    print(f"  Flagged for review: {result['flagged_count']}")
    print()

    # Pass 2: AI-assisted attribution (using stub for demonstration)
    print("=" * 70)
    print("PASS 2: AI-Assisted Attribution (using stub)")
    print("=" * 70)
    ai_result = run_ai_assisted_pass(result['lines'], roster, client=None)
    print(f"  Scenes total: {ai_result['scenes_total']}")
    print(f"  Scenes processed: {ai_result['scenes_processed']}")
    print(f"  Lines updated: {ai_result['lines_updated']}")
    print(f"  API calls made: {ai_result['api_calls']}")
    print()

    # Show final tagged output
    print("=" * 70)
    print("FINAL ATTRIBUTED OUTPUT")
    print("=" * 70)
    for line in ai_result['lines']:
        flag = f"  [{line.flag_reason}]" if line.flag_reason else ""
        conf = "" if line.confidence == "high" else f"  ({line.confidence})"
        preview = line.line[:100] + ("..." if len(line.line) > 100 else "")
        print(f"[{line.speaker}]{conf}{flag}")
        print(f"  {preview}")
        print()
