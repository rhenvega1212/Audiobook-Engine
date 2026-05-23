import type { EngineCharacter, TaggedLine } from "./types";
import { CHAPTER_HEADING_RE } from "./regex";

export interface SceneChunk {
  scene_id: number;
  start_line: number;
  end_line: number;
  has_flags: boolean;
}

const SCENE_BREAK_NARRATOR_RUN = 3;

export function groupLinesIntoScenes(taggedLines: TaggedLine[]): SceneChunk[] {
  const scenes: SceneChunk[] = [];
  let sceneStart = 0;
  let consecutiveNarrator = 0;

  for (let i = 0; i < taggedLines.length; i++) {
    const line = taggedLines[i];
    const isChapter =
      line.speaker === "Narrator" &&
      CHAPTER_HEADING_RE.test(line.line.trim());

    if (line.speaker === "Narrator") {
      consecutiveNarrator++;
    } else {
      consecutiveNarrator = 0;
    }

    const isSceneBreak =
      isChapter || consecutiveNarrator >= SCENE_BREAK_NARRATOR_RUN;

    if (isSceneBreak && i > sceneStart) {
      const sceneLines = taggedLines.slice(sceneStart, i);
      scenes.push({
        scene_id: scenes.length,
        start_line: sceneStart,
        end_line: i,
        has_flags: sceneLines.some((l) => l.flag_reason),
      });
      sceneStart = i;
    }
  }

  if (sceneStart < taggedLines.length) {
    const sceneLines = taggedLines.slice(sceneStart);
    scenes.push({
      scene_id: scenes.length,
      start_line: sceneStart,
      end_line: taggedLines.length,
      has_flags: sceneLines.some((l) => l.flag_reason),
    });
  }

  return scenes;
}

export function buildAttributionPrompt(
  sceneLines: TaggedLine[],
  roster: EngineCharacter[],
  flaggedIndices: number[]
): string {
  const rosterText = roster
    .map(
      (c) =>
        `- ${c.canonical_name} (${c.gender}) — also known as: ${c.aliases.join(", ")}`
    )
    .join("\n");

  let sceneText = "";
  for (let i = 0; i < sceneLines.length; i++) {
    const line = sceneLines[i];
    const marker = flaggedIndices.includes(i) ? "  ⚠ NEEDS REVIEW" : "";
    sceneText += `[${i}] [${line.speaker}] ${line.line}${marker}\n`;
  }

  return `You are an expert at attributing dialogue to characters in a novel.

CHARACTER ROSTER:
${rosterText}

SCENE (with current attributions):
${sceneText}

Lines marked "⚠ NEEDS REVIEW" had ambiguous attribution from the rules engine.
Review the FULL scene context and determine the correct speaker for each one.

Important rules:
- "Narrator" is correct for non-dialogue (descriptive text)
- Use exact canonical names from the roster (e.g. "Nikki Sands" not "Nikki")
- If you cannot determine the speaker with confidence, return "UNKNOWN"
- Consider conversation flow: in a 2-person dialogue, speakers usually alternate
- Watch for scene transitions where new characters arrive

Return ONLY a JSON object in this exact format, with no additional text:
{
  "attributions": [
    {"line_index": 0, "speaker": "Nikki Sands", "confidence": "high"}
  ]
}

Only include line indices that were marked NEEDS REVIEW. Confidence should be
"high", "medium", or "low" based on how certain you are.`;
}

export async function callClaudeForAttribution(
  prompt: string,
  apiKey: string
): Promise<{ attributions: { line_index: number; speaker: string; confidence: string }[] }> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content[0];
  if (block.type !== "text") {
    throw new Error("Unexpected response type");
  }

  let text = block.text.trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

  return JSON.parse(text);
}

export async function runAiAssistedPass(
  taggedLines: TaggedLine[],
  roster: EngineCharacter[],
  apiKey: string
): Promise<{
  lines: TaggedLine[];
  scenes_total: number;
  scenes_processed: number;
  lines_updated: number;
  api_calls: number;
}> {
  const scenes = groupLinesIntoScenes(taggedLines);
  let scenesProcessed = 0;
  let linesUpdated = 0;
  let apiCalls = 0;

  for (const scene of scenes) {
    if (!scene.has_flags) continue;

    const sceneLines = taggedLines.slice(scene.start_line, scene.end_line);
    const flaggedIndices = sceneLines
      .map((l, i) => (l.flag_reason ? i : -1))
      .filter((i) => i >= 0);

    if (flaggedIndices.length === 0) continue;

    const prompt = buildAttributionPrompt(sceneLines, roster, flaggedIndices);

    try {
      const response = await callClaudeForAttribution(prompt, apiKey);
      apiCalls++;

      for (const attr of response.attributions ?? []) {
        const localIdx = attr.line_index;
        const globalIdx = scene.start_line + localIdx;
        if (globalIdx < 0 || globalIdx >= taggedLines.length) continue;

        const oldSpeaker = taggedLines[globalIdx].speaker;
        const newSpeaker = attr.speaker;
        taggedLines[globalIdx].speaker = newSpeaker;
        taggedLines[globalIdx].confidence = (attr.confidence as TaggedLine["confidence"]) ?? "medium";
        taggedLines[globalIdx].flag_reason =
          oldSpeaker !== newSpeaker
            ? `ai_reviewed (was: ${taggedLines[globalIdx].flag_reason}; changed: ${oldSpeaker} → ${newSpeaker})`
            : `ai_confirmed (was: ${taggedLines[globalIdx].flag_reason})`;

        if (oldSpeaker !== newSpeaker) linesUpdated++;
      }

      scenesProcessed++;
    } catch (e) {
      console.error(`AI attribution failed for scene ${scene.scene_id}:`, e);
    }
  }

  return {
    lines: taggedLines,
    scenes_total: scenes.length,
    scenes_processed: scenesProcessed,
    lines_updated: linesUpdated,
    api_calls: apiCalls,
  };
}
