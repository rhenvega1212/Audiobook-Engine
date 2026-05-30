import type { EngineCharacter, TaggedLine } from "./types";
import { CHAPTER_HEADING_RE } from "./regex";
import type { AiReviewProposal } from "@/lib/books/ai-review-proposals";

export type TaggedLineForAi = TaggedLine & { ai_reviewed?: boolean; human_reviewed?: boolean };

export type AiPassOptions = {
  /** Re-process lines Claude already reviewed (still skips human_reviewed). */
  includeAiReviewed?: boolean;
  /** Global indices Claude may change (scope filter). */
  eligibleIndices?: Set<number>;
  /** Lines already handled in this preview run (avoids duplicate batches). */
  previewProcessed?: Set<number>;
};

/** High-confidence AI pass with flag cleared — keep on re-runs. */
export function isSettledAiAssignment(line: TaggedLineForAi): boolean {
  return (
    !!line.ai_reviewed &&
    !line.flag_reason &&
    line.confidence === "high" &&
    !line.human_reviewed
  );
}

/** Reject speaker flips that undo a good prior assignment (defense in depth). */
export function shouldProposeSpeakerChange(
  line: TaggedLineForAi,
  oldSpeaker: string,
  newSpeaker: string
): boolean {
  if (oldSpeaker === newSpeaker) return true;
  if (newSpeaker !== "Narrator" || oldSpeaker === "Narrator" || oldSpeaker === "UNKNOWN") {
    return true;
  }
  if (isSettledAiAssignment(line)) return false;
  if (line.confidence === "high" && !line.flag_reason) return false;
  const text = line.line.trim();
  if (/["'\u201C\u201D\u2018\u2019]/.test(text)) return false;
  return true;
}

/** True when this line still needs a Claude attribution pass. */
export function lineNeedsAiPass(
  line: TaggedLineForAi,
  globalIndex: number,
  options?: AiPassOptions
): boolean {
  if (line.human_reviewed) return false;
  if (options?.previewProcessed?.has(globalIndex)) return false;
  if (options?.eligibleIndices && !options.eligibleIndices.has(globalIndex)) {
    return false;
  }
  if (isSettledAiAssignment(line)) return false;
  if (options?.includeAiReviewed && line.ai_reviewed) {
    return (
      !!line.flag_reason ||
      line.speaker === "UNKNOWN" ||
      line.confidence !== "high"
    );
  }
  return !!line.flag_reason && !line.ai_reviewed;
}

export type SceneLineContext = {
  line: TaggedLineForAi;
  paragraph_num: number;
};

export interface SceneChunk {
  scene_id: number;
  start_line: number;
  end_line: number;
  has_flags: boolean;
}

const SCENE_BREAK_NARRATOR_RUN = 3;

export function groupLinesIntoScenes(
  taggedLines: TaggedLineForAi[],
  options?: AiPassOptions
): SceneChunk[] {
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
        has_flags: sceneLines.some((l, j) =>
          lineNeedsAiPass(l, sceneStart + j, options)
        ),
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
      has_flags: sceneLines.some((l, j) =>
        lineNeedsAiPass(l, sceneStart + j, options)
      ),
    });
  }

  return scenes;
}

export function buildAttributionPrompt(
  sceneLines: SceneLineContext[],
  roster: EngineCharacter[],
  flaggedIndices: number[],
  sourceParagraphs?: string[]
): string {
  const rosterText = roster
    .map((c) => {
      const aliases =
        c.aliases.length > 0 ? c.aliases.join(", ") : "(none)";
      return `- ${c.canonical_name} (${c.gender}) — also known as: ${aliases}`;
    })
    .join("\n");

  const paraNums = [
    ...new Set(sceneLines.map((s) => s.paragraph_num)),
  ].sort((a, b) => a - b);

  let sourceBlock = "";
  if (sourceParagraphs && paraNums.length > 0) {
    const parts: string[] = [];
    for (const pn of paraNums) {
      const src = sourceParagraphs[pn]?.trim();
      if (src) parts.push(`[paragraph ${pn}]\n${src}`);
    }
    if (parts.length > 0) {
      sourceBlock = `SOURCE MANUSCRIPT (verbatim from Word — authoritative for quotes and dialogue):
${parts.join("\n\n")}

`;
    }
  }

  let sceneText = "";
  for (let i = 0; i < sceneLines.length; i++) {
    const { line, paragraph_num } = sceneLines[i]!;
    const flagged = flaggedIndices.includes(i);
    const marker = flagged
      ? line.ai_reviewed
        ? "  ⚠ RE-CHECK — keep current speaker unless source clearly contradicts"
        : "  ⚠ NEEDS REVIEW"
      : "";
    const hasSource = !!sourceParagraphs?.[paragraph_num]?.trim();
    const textNote = hasSource
      ? `(paragraph ${paragraph_num} — see source above)`
      : line.line;
    sceneText += `[${i}] [${line.speaker}] ${textNote}${marker}\n`;
  }

  return `You are an expert at attributing dialogue to characters in a novel.

CHARACTER ROSTER:
${rosterText}

${sourceBlock}CURRENT LINE ATTRIBUTIONS (existing assignments — treat character speakers as strong priors):
${sceneText}

Lines marked "⚠ NEEDS REVIEW" need a first-pass speaker. Lines marked "⚠ RE-CHECK" were reviewed before — only change them if the SOURCE MANUSCRIPT clearly contradicts the current speaker. Use the source for quote boundaries and conversational flow.

Important rules:
- "Narrator" is correct for non-dialogue (descriptive prose, action beats)
- Quoted speech must be assigned to a character, not Narrator — never change a character line to Narrator when quotes appear in the source
- If the current speaker matches quoted dialogue in the source, return that same speaker with high confidence
- Use exact canonical names from the roster (e.g. "Nikki Sands" not "Nikki")
- If you cannot determine the speaker with confidence, return "UNKNOWN"
- Consider conversation flow: in a 2-person dialogue, speakers usually alternate
- Watch for scene transitions where new characters arrive
- Prefer "low" confidence over guessing when attribution is ambiguous — do not clear uncertainty with a wild guess

Respond with ONLY valid JSON, no markdown or explanation:
{
  "attributions": [
    {"line_index": 0, "speaker": "Nikki Sands", "confidence": "high"}
  ]
}

Only include line indices marked NEEDS REVIEW or RE-CHECK. Confidence should be
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
  options?: { maxScenes?: number; previewOnly?: boolean } & AiPassOptions & {
      paragraphNums?: number[];
      sourceParagraphs?: string[];
      lineIds?: string[];
      lineOrders?: number[];
    }
): Promise<{
  lines: TaggedLineForAi[];
  proposals: AiReviewProposal[];
  scenes_total: number;
  scenes_processed: number;
  lines_updated: number;
  api_calls: number;
  processed_line_indices: number[];
  has_more: boolean;
  errors: string[];
}> {
  const scenes = groupLinesIntoScenes(taggedLines, options);
  let scenesProcessed = 0;
  let linesUpdated = 0;
  let apiCalls = 0;
  let scenesAttempted = 0;
  const processedLineIndices = new Set<number>();
  const proposals: AiReviewProposal[] = [];
  const errors: string[] = [];
  const previewOnly = options?.previewOnly === true;

  for (const scene of scenes) {
    if (!scene.has_flags) continue;

    if (options?.maxScenes && scenesAttempted >= options.maxScenes) {
      break;
    }

    scenesAttempted++;

    const sceneSlice = taggedLines.slice(scene.start_line, scene.end_line);
    const sceneLines: SceneLineContext[] = sceneSlice.map((line, i) => ({
      line,
      paragraph_num:
        options?.paragraphNums?.[scene.start_line + i] ?? line.paragraph_num,
    }));

    const flaggedIndices = sceneLines
      .map((ctx, i) =>
        lineNeedsAiPass(ctx.line, scene.start_line + i, options) ? i : -1
      )
      .filter((i) => i >= 0);

    if (flaggedIndices.length === 0) continue;

    const prompt = buildAttributionPrompt(
      sceneLines,
      roster,
      flaggedIndices,
      options?.sourceParagraphs
    );

    try {
      const response = await callClaudeForAttribution(prompt, apiKey);
      apiCalls++;

      for (const attr of response.attributions ?? []) {
        const localIdx = attr.line_index;
        const globalIdx = scene.start_line + localIdx;
        if (globalIdx < 0 || globalIdx >= taggedLines.length) continue;
        if (!flaggedIndices.includes(localIdx)) continue;

        const oldSpeaker = taggedLines[globalIdx]!.speaker;
        const newSpeaker = attr.speaker;
        const confidence =
          (attr.confidence as TaggedLine["confidence"]) ?? "medium";
        const line = taggedLines[globalIdx]!;

        if (!shouldProposeSpeakerChange(line, oldSpeaker, newSpeaker)) {
          continue;
        }

        const lineId = options?.lineIds?.[globalIdx] ?? "";
        const lineOrder =
          options?.lineOrders?.[globalIdx] ?? line.paragraph_num;

        proposals.push({
          line_id: lineId,
          global_index: globalIdx,
          line_order: lineOrder,
          old_speaker: oldSpeaker,
          new_speaker: newSpeaker,
          confidence,
          line_text: taggedLines[globalIdx]!.line,
          flag_reason: taggedLines[globalIdx]!.flag_reason ?? null,
          changed: oldSpeaker !== newSpeaker,
        });

        if (previewOnly) continue;

        taggedLines[globalIdx]!.speaker = newSpeaker;
        taggedLines[globalIdx]!.confidence = confidence;
        taggedLines[globalIdx]!.flag_reason =
          oldSpeaker !== newSpeaker
            ? `ai_reviewed (was: ${taggedLines[globalIdx]!.flag_reason ?? "none"}; changed: ${oldSpeaker} → ${newSpeaker})`
            : `ai_confirmed (was: ${taggedLines[globalIdx]!.flag_reason ?? "none"})`;

        if (oldSpeaker !== newSpeaker) linesUpdated++;
      }

      for (const localIdx of flaggedIndices) {
        const globalIdx = scene.start_line + localIdx;
        processedLineIndices.add(globalIdx);
        if (!previewOnly) {
          taggedLines[globalIdx]!.ai_reviewed = true;
        }
      }

      scenesProcessed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`Scene ${scene.scene_id}: ${msg}`);
      console.error(`AI attribution failed for scene ${scene.scene_id}:`, e);
    }
  }

  const has_more = taggedLines.some((l, i) => lineNeedsAiPass(l, i, options));

  return {
    lines: taggedLines,
    proposals,
    scenes_total: scenes.length,
    scenes_processed: scenesProcessed,
    lines_updated: linesUpdated,
    api_calls: apiCalls,
    processed_line_indices: [...processedLineIndices],
    has_more,
    errors,
  };
}
