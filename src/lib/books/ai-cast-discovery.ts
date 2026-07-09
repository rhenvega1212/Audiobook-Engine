/**
 * Cold-start cast discovery. On a brand-new series the character roster is
 * nearly empty, so the attribution AI (which only assigns lines to known
 * characters) defaults most dialogue to UNKNOWN. This pass reads a sample of the
 * manuscript up front and asks Claude for the list of speaking characters, so
 * the roster is populated BEFORE attribution runs.
 */

export type DiscoveredCharacter = {
  canonical_name: string;
  gender: "male" | "female" | "unknown";
  aliases: string[];
};

/** Sample paragraphs spread across the whole book, capped to a char budget. */
function buildManuscriptSample(paragraphs: string[], maxChars: number): string {
  const picked: string[] = [];
  let total = 0;
  const step = Math.max(1, Math.ceil(paragraphs.length / 500));
  for (let i = 0; i < paragraphs.length; i += step) {
    const p = paragraphs[i]?.trim();
    if (!p) continue;
    if (total + p.length > maxChars) break;
    picked.push(p);
    total += p.length;
  }
  return picked.join("\n\n");
}

function buildCastDiscoveryPrompt(
  sample: string,
  existingNames: string[]
): string {
  const known =
    existingNames.length > 0
      ? `ALREADY KNOWN (do not repeat these): ${existingNames.join(", ")}\n\n`
      : "";

  return `You are analyzing a novel manuscript to build its cast of speaking characters.

${known}Below are excerpts sampled throughout the manuscript.

MANUSCRIPT EXCERPTS:
${sample}

List every character who SPEAKS dialogue in the story. For each, provide:
- "name": the fullest canonical form of their name used in the text (e.g. "Gabriel Cross", not just "Gabriel", if a surname appears)
- "gender": "male", "female", or "unknown" — infer from pronouns/context; use "unknown" if genuinely unclear
- "aliases": other names, nicknames, or titles the SAME person is called (e.g. ["Gabe", "Mr. Cross"]); use [] if none

Rules:
- Only include characters who actually speak. Exclude places, objects, groups, and the narrator.
- Do not include one-off unnamed speakers (e.g. "a man", "the waiter", "a voice").
- Merge duplicates: a first name and full name for the same person is ONE entry (put the short form in aliases).

Respond with ONLY valid JSON, no markdown or explanation:
{"characters":[{"name":"Gabriel Cross","gender":"male","aliases":["Gabe"]}]}`;
}

function parseCastJson(text: string): DiscoveredCharacter[] {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

  const tryParse = (s: string): DiscoveredCharacter[] | null => {
    try {
      const parsed = JSON.parse(s);
      const arr = Array.isArray(parsed) ? parsed : parsed.characters;
      if (!Array.isArray(arr)) return null;
      return arr
        .map((c: Record<string, unknown>) => ({
          canonical_name: String(c.name ?? "").trim(),
          gender: (["male", "female", "unknown"].includes(String(c.gender))
            ? String(c.gender)
            : "unknown") as DiscoveredCharacter["gender"],
          aliases: Array.isArray(c.aliases)
            ? c.aliases.map((a) => String(a).trim()).filter(Boolean)
            : [],
        }))
        .filter((c) => c.canonical_name.length > 0);
    } catch {
      return null;
    }
  };

  const direct = tryParse(cleaned);
  if (direct) return direct;

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const sliced = tryParse(cleaned.slice(start, end + 1));
    if (sliced) return sliced;
  }
  return [];
}

/**
 * Ask Claude for the speaking cast of the manuscript. Best-effort: returns [] on
 * any failure so the caller can fall back to regex-based seeding.
 */
export async function discoverCastWithAI(
  paragraphs: string[],
  apiKey: string,
  existingNames: string[]
): Promise<DiscoveredCharacter[]> {
  const sample = buildManuscriptSample(paragraphs, 60000);
  if (!sample.trim()) return [];

  const prompt = buildCastDiscoveryPrompt(sample, existingNames);
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    system:
      "You extract the speaking cast of a novel. Always respond with a single valid JSON object only.",
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content[0];
  if (!block || block.type !== "text") return [];
  return parseCastJson(block.text);
}
