/**
 * Run: npx tsx scripts/seed-voice-ids.ts
 * Requires .env.local with SUPABASE_* and ELEVENLABS_API_KEY
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { matchElevenLabsVoice } from "../src/lib/elevenlabs/match-voice";

function loadEnv() {
  const path = resolve(process.cwd(), ".env.local");
  const content = readFileSync(path, "utf8");
  for (const line of content.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
}

loadEnv();

async function main() {
  const elevenKey = process.env.ELEVENLABS_API_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!elevenKey || !supabaseUrl || !serviceKey) {
    console.error("Missing env vars");
    process.exit(1);
  }

  const voicesRes = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": elevenKey },
  });
  const voicesData = (await voicesRes.json()) as {
    voices: { voice_id: string; name: string }[];
  };
  const voices = voicesData.voices ?? [];

  const charsRes = await fetch(
    `${supabaseUrl}/rest/v1/characters?select=id,canonical_name,elevenlabs_voice_name,voice_style&elevenlabs_voice_name=not.is.null`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    }
  );
  const characters = (await charsRes.json()) as {
    id: string;
    canonical_name: string;
    elevenlabs_voice_name: string;
    voice_style: string | null;
  }[];

  let matched = 0;
  let missed = 0;

  for (const char of characters) {
    const voiceName = char.elevenlabs_voice_name;
    if (!voiceName) continue;

    const match = matchElevenLabsVoice(voiceName, voices, char.voice_style);
    if (!match) {
      console.warn(`No ElevenLabs voice for: ${voiceName} (${char.canonical_name})`);
      missed++;
      continue;
    }

    const patchRes = await fetch(
      `${supabaseUrl}/rest/v1/characters?id=eq.${char.id}`,
      {
        method: "PATCH",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          elevenlabs_voice_id: match.voice_id,
          elevenlabs_voice_name: match.name,
        }),
      }
    );

    if (patchRes.ok) {
      console.log(`✓ ${char.canonical_name} → ${match.name}`);
      matched++;
    } else {
      console.error(`✗ ${char.canonical_name}:`, await patchRes.text());
      missed++;
    }
  }

  console.log(`\nDone: ${matched} matched, ${missed} missed`);
}

main();
