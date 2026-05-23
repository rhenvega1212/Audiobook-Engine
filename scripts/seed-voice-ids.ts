/**
 * Run: npx tsx scripts/seed-voice-ids.ts
 * Requires .env.local with SUPABASE_* and ELEVENLABS_API_KEY
 */
import { readFileSync } from "fs";
import { resolve } from "path";

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

const VOICE_NAMES = [
  "Bella",
  "Eliza",
  "Adam",
  "Vega",
  "Janet",
  "Andres",
  "Cameo",
  "Brittany",
  "Kel",
];

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

  const byName = new Map<string, { voice_id: string; name: string }>();
  for (const v of voicesData.voices ?? []) {
    byName.set(v.name.toLowerCase(), v);
  }

  const charsRes = await fetch(
    `${supabaseUrl}/rest/v1/characters?select=id,canonical_name,elevenlabs_voice_name&elevenlabs_voice_name=not.is.null`,
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
  }[];

  for (const char of characters) {
    const voiceName = char.elevenlabs_voice_name;
    if (!voiceName) continue;
    const match = byName.get(voiceName.toLowerCase());
    if (!match) {
      console.warn(`No ElevenLabs voice for: ${voiceName} (${char.canonical_name})`);
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
      console.log(`✓ ${char.canonical_name} → ${match.name} (${match.voice_id})`);
    } else {
      console.error(`✗ ${char.canonical_name}:`, await patchRes.text());
    }
  }
}

main();
