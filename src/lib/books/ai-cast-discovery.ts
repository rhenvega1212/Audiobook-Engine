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

/** Sample beginning, middle, and end so cast discovery sees the full book. */
function buildManuscriptSample(paragraphs: string[], maxChars: number): string {
  const chunks: string[] = [];
  let total = 0;

  function appendSlice(start: number, count: number) {
    for (let i = start; i < Math.min(start + count, paragraphs.length); i++) {
      const p = paragraphs[i]?.trim();
      if (!p) continue;
      if (total + p.length > maxChars) return false;
      chunks.push(p);
      total += p.length;
    }
    return true;
  }

  // Opening chapters (character introductions)
  if (!appendSlice(0, 100)) return chunks.join("\n\n");
  // Mid-book
  const mid = Math.floor(paragraphs.length / 2);
  if (!appendSlice(Math.max(0, mid - 30), 60)) return chunks.join("\n\n");
  // Closing chapters
  appendSlice(Math.max(0, paragraphs.length - 80), 80);

  // Stride through the rest if budget remains
  const step = Math.max(1, Math.ceil(paragraphs.length / 300));
  for (let i = 0; i < paragraphs.length; i += step) {
    if (total >= maxChars) break;
    const p = paragraphs[i]?.trim();
    if (!p || chunks.includes(p)) continue;
    if (total + p.length > maxChars) break;
    chunks.push(p);
    total += p.length;
  }

  return chunks.join("\n\n");
}

function buildCastDiscoveryPrompt(
  sample: string,
  existingNames: string[]
): string {
  const known =
    existingNames.length > 0
      ? `ALREADY KNOWN (do not repeat these): ${existingNames.join(", ")}\n\n`
      : "";

  return `You are analyzing a novel manuscript to build its cast of characters.

${known}Below are excerpts from the beginning, middle, and end of the manuscript.

MANUSCRIPT EXCERPTS:
${sample}

List every character who SPEAKS dialogue OR appears in a scene action beat (e.g. "Lina said", "Lina shook her head", "Michael turned to face her").

For each, provide:
- "name": the fullest canonical form of their name used in the text (e.g. "Gabriel Cross", not just "Gabriel", if a surname appears)
- "gender": "male", "female", or "unknown" — infer from pronouns/context; use "unknown" if genuinely unclear
- "aliases": other names, nicknames, or titles the SAME person is called (e.g. ["Gabe", "Mr. Cross"]); use [] if none

Rules:
- Only include people who participate in scenes — speaking or acting. Exclude place names, book titles, and people mentioned only in passing ("she read about Napoleon").
- Exclude one-off unnamed roles ("a man", "the waiter", "a voice").
- Merge duplicates: a first name and full name for the same person is ONE entry (put the short form in aliases).
- When unsure whether someone is an active character, omit them — false negatives are better than junk cast rows.

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
  const sample = buildManuscriptSample(paragraphs, 90000);
  if (!sample.trim()) return [];

  const prompt = buildCastDiscoveryPrompt(sample, existingNames);
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system:
      "You extract the speaking cast of a novel. Always respond with a single valid JSON object only.",
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content[0];
  if (!block || block.type !== "text") return [];
  return parseCastJson(block.text);
}
