/**
 * Re-run rules analysis (+ optional AI) for all books with manuscripts.
 *
 *   npx tsx scripts/reanalyze-all-books.ts
 *   npx tsx scripts/reanalyze-all-books.ts --dry-run
 *   npx tsx scripts/reanalyze-all-books.ts --book-id=<uuid>
 *
 * WARNING: Deletes and rebuilds tagged_lines per book. Human line edits are lost
 * unless you add a preserve pass later.
 */
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  const path = resolve(process.cwd(), ".env.local");
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
}

loadEnv();

import { createAdminClient } from "../src/lib/supabase/admin";
import { analyzeBook } from "../src/lib/books/analyze-book";
import { checkSeriesAnalyzeReadiness } from "../src/lib/characters/analyze-readiness";
import type { Character } from "../src/lib/types/database";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const bookIdArg = process.argv.find((a) => a.startsWith("--book-id="));
  const onlyBookId = bookIdArg?.split("=")[1];

  const admin = createAdminClient();

  let query = admin
    .from("books")
    .select("id, title, series_id, manuscript_path")
    .not("manuscript_path", "is", null);

  if (onlyBookId) query = query.eq("id", onlyBookId);

  const { data: books, error } = await query;
  if (error) throw new Error(error.message);

  console.log(`Found ${books?.length ?? 0} book(s) with manuscripts`);

  for (const book of books ?? []) {
    const { data: characters } = await admin
      .from("characters")
      .select("id, canonical_name, aliases, role")
      .eq("series_id", book.series_id);

    const readiness = checkSeriesAnalyzeReadiness(
      (characters ?? []) as Character[]
    );

    if (!readiness.ready) {
      console.warn(
        `SKIP ${book.title} (${book.id}): cast not ready —`,
        readiness.issues.map((i) => i.canonical_name).join(", ")
      );
      continue;
    }

    if (dryRun) {
      console.log(`DRY RUN would analyze: ${book.title} (${book.id})`);
      continue;
    }

    console.log(`Analyzing: ${book.title} (${book.id})…`);
    await admin
      .from("books")
      .update({ ai_spend_usd: 0 })
      .eq("id", book.id);

    const summary = await analyzeBook(book.id, { runAiReview: false });
    console.log(
      `  → ${summary.total_lines} lines, ${summary.flagged_count} flagged`
    );
    console.log(
      `  → Run AI from app or: npx tsx scripts/test-ai-review.ts ${book.id}`
    );
  }

  console.log("Done. Use Review in the app for flagged lines.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
