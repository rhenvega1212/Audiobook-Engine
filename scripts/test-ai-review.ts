/**
 * Smoke-test batched AI review (no browser auth).
 * Run: npx tsx scripts/test-ai-review.ts [bookId]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { runAiReviewForBook } from "../src/lib/books/run-ai-review";

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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY missing");
    process.exit(1);
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let bookId = process.argv[2];
  if (!bookId) {
    const { data: books } = await admin
      .from("books")
      .select("id, title")
      .order("created_at", { ascending: false })
      .limit(1);
    bookId = books?.[0]?.id;
    console.log("Using book:", books?.[0]?.title, bookId);
  }

  if (!bookId) {
    console.error("No book found");
    process.exit(1);
  }

  const result = await runAiReviewForBook(admin, bookId, apiKey, {
    maxScenes: 2,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
