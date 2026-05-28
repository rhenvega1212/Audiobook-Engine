/**
 * Re-run manuscript analysis for a book (service role, no browser).
 * Usage: npx tsx scripts/rerun-analysis.ts [bookId]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { analyzeBook } from "../src/lib/books/analyze-book";

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

  console.log("Starting analysis…");
  const start = Date.now();
  const summary = await analyzeBook(bookId);
  console.log(`Done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
