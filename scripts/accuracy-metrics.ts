/**
 * Rules-engine accuracy metrics on a manuscript (no DB).
 * Run: npx tsx scripts/accuracy-metrics.ts
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import mammoth from "mammoth";
import { processManuscript } from "../src/lib/engine/rules-engine";
import { createEngineCharacter } from "../src/lib/engine/types";

const MANUSCRIPT = resolve(
  process.env.HOME ?? "",
  "Downloads/MURDER BY THE GLASS_10_09_20_Liza.docx"
);

const WINE_LOVERS_ROSTER = [
  ["Nikki Sands", ["Nikki"], "female"],
  ["Derek Malveaux", ["Derek"], "male"],
  ["Isabel", [], "female"],
  ["Susan", [], "female"],
  ["Andres", [], "male"],
  ["Pamela", [], "female"],
  ["Jennifer", [], "female"],
  ["Blake", [], "male"],
  ["Marty", [], "male"],
  ["Narrator", [], "unknown"],
] as const;

function loadEnv() {
  const path = resolve(process.cwd(), ".env.local");
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
}

async function main() {
  loadEnv();
  const buffer = readFileSync(MANUSCRIPT);
  const { value: text } = await mammoth.extractRawText({ buffer });
  const roster = WINE_LOVERS_ROSTER.map(([name, aliases, gender]) =>
    createEngineCharacter(name, [...aliases], gender)
  );

  const result = processManuscript(text, roster);
  const dialogue = result.lines.filter((l) => l.speaker !== "Narrator");
  const flagged = result.lines.filter((l) => l.flag_reason);
  const flaggedDialogue = dialogue.filter((l) => l.flag_reason);
  const unflaggedDialogue = dialogue.filter((l) => !l.flag_reason);
  const highConfDialogue = dialogue.filter(
    (l) => l.confidence === "high" && !l.flag_reason
  );
  const unknown = dialogue.filter((l) => l.speaker === "UNKNOWN");

  const pct = (n: number, d: number) =>
    d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "n/a";

  console.log("\n=== Rules engine accuracy metrics ===\n");
  console.log(`Manuscript: ${MANUSCRIPT}`);
  console.log(`Total lines: ${result.total_lines}`);
  console.log(`Dialogue lines: ${dialogue.length}`);
  console.log(`Flagged (all): ${flagged.length} (${pct(flagged.length, result.total_lines)} of total)`);
  console.log(
    `Flagged dialogue: ${flaggedDialogue.length} (${pct(flaggedDialogue.length, dialogue.length)} of dialogue)`
  );
  console.log(
    `Unflagged dialogue (auto-trusted): ${unflaggedDialogue.length} (${pct(unflaggedDialogue.length, dialogue.length)})`
  );
  console.log(
    `High-confidence unflagged dialogue: ${highConfDialogue.length} (${pct(highConfDialogue.length, dialogue.length)})`
  );
  console.log(`UNKNOWN dialogue: ${unknown.length}`);
  console.log(`Unknown speaker names detected: ${result.unknown_speakers.join(", ") || "(none)"}`);

  const byReason: Record<string, number> = {};
  for (const l of flagged) {
    const r = l.flag_reason ?? "null";
    byReason[r] = (byReason[r] ?? 0) + 1;
  }
  console.log("\nFlag reasons:");
  for (const [r, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${r}: ${n}`);
  }

  const targetHumanReview = flaggedDialogue.length;
  const autoTrusted = unflaggedDialogue.length;
  console.log("\n--- Interpretation ---");
  console.log(
    `Human review queue (flagged dialogue): ~${targetHumanReview} lines`
  );
  console.log(
    `Auto-trusted dialogue: ~${autoTrusted} lines (${pct(autoTrusted, dialogue.length)})`
  );
  if (autoTrusted / dialogue.length >= 0.85) {
    console.log("✓ Unflagged dialogue ratio ≥ 85% (approaching 90% target for rules-only pass)");
  } else {
    console.log("⚠ Flag rate high — expect more human review before export");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
