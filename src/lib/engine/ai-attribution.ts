import type { EngineCharacter, TaggedLine } from "./types";
import { CHAPTER_HEADING_RE } from "./regex";

export type TaggedLineForAi = TaggedLine & { ai_reviewed?: boolean };

export interface SceneChunk {
  scene_id: number;
  start_line: number;
  end_line: number;
  has_flags: boolean;
}

const SCENE_BREAK_NARRATOR_RUN = 3;

export function groupLinesIntoScenes(taggedLines: TaggedLineForAi[]): SceneChunk[] {
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
        has_flags: sceneLines.some((l) => l.flag_reason && !l.ai_reviewed),
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
      has_flags: sceneLines.some((l) => l.flag_reason && !l.ai_reviewed),
    });
  }

  return scenes;
}

export function buildAttributionPrompt(
  sceneLines: TaggedLineForAi[],
  roster: EngineCharacter[],
  flaggedIndices: number[]
): string {
  const rosterText = roster
    .map((c) => {
      const aliases =
        c.aliases.length > 0 ? c.aliases.join(", ") : "(none)";
      return `- ${c.canonical_name} (${c.gender}) — also known as: ${aliases}`;
    })
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

Respond with ONLY valid JSON, no markdown or explanation:
{
  "attributions": [
    {"line_index": 0, "speaker": "Nikki Sands", "confidence": "high"}
  ]
}

Only include line indices that were marked NEEDS REVIEW. Confidence should be
"high", "medium", or "low" based on how certain you are.`;
}

function parseAttributionJson(text: string): {
  attributions: { line_index: number; speaker: string; confidence: string }[];
} {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed.attributions)) return parsed;
    if (Array.isArray(parsed)) return { attributions: parsed };
  } catch {
    // fall through
  }

  const objStart = cleaned.indexOf("{");
  const objEnd = cleaned.lastIndexOf("}");
  if (objStart >= 0 && objEnd > objStart) {
    try {
      const parsed = JSON.parse(cleaned.slice(objStart, objEnd + 1));
      if (Array.isArray(parsed.attributions)) return parsed;
    } catch {
      // fall through
    }
  }

  const arrayMatch = cleaned.match(/"attributions"\s*:\s*(\[[\s\S]*?\])\s*[,}]/);
  if (arrayMatch) {
    try {
      const attributions = JSON.parse(arrayMatch[1]);
      if (Array.isArray(attributions)) return { attributions };
    } catch {
      // fall through
    }
  }

  throw new Error("Model returned non-JSON response");
}

export async function callClaudeForAttribution(
  prompt: string,
  apiKey: string
): Promise<{ attributions: { line_index: number; speaker: string; confidence: string }[] }> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system:
      "You attribute dialogue in novels. Always respond with a single valid JSON object only.",
    messages: [{ role: "user", content: prompt }],
  }).catch((e: { status?: number; message?: string }) => {
    if (e.status === 404 && String(e.message).includes("model:")) {
      throw new Error(
        `Claude model "${model}" not found. Set ANTHROPIC_MODEL=claude-sonnet-4-6 in .env.local`
      );
    }
    throw e;
  });

  const block = response.content[0];
  if (block.type !== "text") {
    throw new Error("Unexpected response type");
  }

  return parseAttributionJson(block.text);
}

export async function runAiAssistedPass(
  taggedLines: TaggedLineForAi[],
  roster: EngineCharacter[],
  apiKey: string,
  options?: { maxScenes?: number }
): Promise<{
  lines: TaggedLineForAi[];
  scenes_total: number;
  scenes_processed: number;
  lines_updated: number;
  api_calls: number;
  processed_line_indices: number[];
  has_more: boolean;
  errors: string[];
}> {
  const scenes = groupLinesIntoScenes(taggedLines);
  let scenesProcessed = 0;
  let linesUpdated = 0;
  let apiCalls = 0;
  let scenesAttempted = 0;
  const processedLineIndices = new Set<number>();
  const errors: string[] = [];

  for (const scene of scenes) {
    if (!scene.has_flags) continue;

    if (options?.maxScenes && scenesAttempted >= options.maxScenes) {
      break;
    }

    scenesAttempted++;

    const sceneLines = taggedLines.slice(scene.start_line, scene.end_line);
    const flaggedIndices = sceneLines
      .map((l, i) => (l.flag_reason && !l.ai_reviewed ? i : -1))
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
        if (!flaggedIndices.includes(localIdx)) continue;

        const oldSpeaker = taggedLines[globalIdx].speaker;
        const newSpeaker = attr.speaker;
        taggedLines[globalIdx].speaker = newSpeaker;
        taggedLines[globalIdx].confidence =
          (attr.confidence as TaggedLine["confidence"]) ?? "medium";
        taggedLines[globalIdx].flag_reason =
          oldSpeaker !== newSpeaker
            ? `ai_reviewed (was: ${taggedLines[globalIdx].flag_reason}; changed: ${oldSpeaker} → ${newSpeaker})`
            : `ai_confirmed (was: ${taggedLines[globalIdx].flag_reason})`;

        if (oldSpeaker !== newSpeaker) linesUpdated++;
      }

      for (const localIdx of flaggedIndices) {
        processedLineIndices.add(scene.start_line + localIdx);
      }

      scenesProcessed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`Scene ${scene.scene_id}: ${msg}`);
      console.error(`AI attribution failed for scene ${scene.scene_id}:`, e);
    }
  }

  const has_more = scenes.some((s) => {
    for (let i = s.start_line; i < s.end_line; i++) {
      if (taggedLines[i].flag_reason && !processedLineIndices.has(i)) {
        return true;
      }
    }
    return false;
  });

  return {
    lines: taggedLines,
    scenes_total: scenes.length,
    scenes_processed: scenesProcessed,
    lines_updated: linesUpdated,
    api_calls: apiCalls,
    processed_line_indices: [...processedLineIndices],
    has_more,
    errors,
  };
}
