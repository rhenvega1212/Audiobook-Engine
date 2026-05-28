/**
 * Applies 20250523000006_character_roles.sql via Supabase Management API or psql.
 * Run: npx tsx scripts/apply-character-roles-migration.ts
 *
 * Set SUPABASE_DB_URL (Session pooler URI from Supabase → Settings → Database) if needed.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";

function loadEnv() {
  const path = resolve(process.cwd(), ".env.local");
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
}

loadEnv();

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20250523000006_character_roles.sql"),
  "utf8"
);

const dbUrl = process.env.SUPABASE_DB_URL;

if (!dbUrl) {
  console.log(
    "Add SUPABASE_DB_URL to .env.local (Database → Connection string → URI), then re-run.\n\nOr paste this in Supabase SQL Editor:\n"
  );
  console.log(sql);
  process.exit(1);
}

try {
  execSync(`psql "${dbUrl}" -v ON_ERROR_STOP=1 -c ${JSON.stringify(sql)}`, {
    stdio: "inherit",
  });
  console.log("Migration applied.");
} catch {
  console.error("psql failed. Paste the SQL in Supabase SQL Editor manually.");
  process.exit(1);
}
