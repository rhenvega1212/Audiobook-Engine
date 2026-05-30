import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";
import { resyncBookChapterPositions } from "../src/lib/books/book-chapters";

function loadEnv() {
  for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
}

async function main() {
  loadEnv();
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const bookId = process.argv[2] ?? "e40955b2-1a40-48a1-b9ab-67de6781a5c9";
  const chapters = await resyncBookChapterPositions(admin, bookId);
  console.log(
    "Resynced",
    chapters.length,
    "chapters:",
    chapters.map((c) => `${c.title} @ line ${c.start_line_order}`)
  );
}

main().catch(console.error);
