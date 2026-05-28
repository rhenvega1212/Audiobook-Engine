/**
 * Remove mis-parsed "characters" from Wine Lover's Mysteries (workflow test pollution).
 * Run: npx tsx scripts/cleanup-junk-characters.ts
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import {
  CANONICAL_CAST_NAMES,
  isJunkCharacterName,
} from "../src/lib/engine/unknown-speaker";

function loadEnv() {
  const path = resolve(process.cwd(), ".env.local");
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
}

loadEnv();

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: series, error: seriesErr } = await admin
    .from("series")
    .select("id, name")
    .eq("name", "Wine Lover's Mysteries")
    .single();

  if (seriesErr || !series) {
    console.error("Series not found:", seriesErr?.message);
    process.exit(1);
  }

  const { data: characters, error: charsErr } = await admin
    .from("characters")
    .select("id, canonical_name, elevenlabs_voice_id")
    .eq("series_id", series.id);

  if (charsErr) {
    console.error(charsErr.message);
    process.exit(1);
  }

  const toDelete = (characters ?? []).filter((c) => {
    if (CANONICAL_CAST_NAMES.has(c.canonical_name)) return false;
    if (c.elevenlabs_voice_id) return false;
    return isJunkCharacterName(c.canonical_name);
  });

  if (toDelete.length === 0) {
    console.log("No junk characters to delete.");
    return;
  }

  console.log(`Deleting ${toDelete.length} junk character(s):`);
  for (const c of toDelete) {
    console.log(`  - ${c.canonical_name}`);
  }

  const ids = toDelete.map((c) => c.id);

  await admin.from("book_characters").delete().in("character_id", ids);
  await admin
    .from("tagged_lines")
    .update({ speaker_character_id: null })
    .in("speaker_character_id", ids);

  const { error: delErr } = await admin.from("characters").delete().in("id", ids);

  if (delErr) {
    console.error("Delete failed:", delErr.message);
    process.exit(1);
  }

  const { count } = await admin
    .from("characters")
    .select("*", { count: "exact", head: true })
    .eq("series_id", series.id);

  console.log(`\nDone. ${series.name} now has ${count} character(s).`);
}

main();
