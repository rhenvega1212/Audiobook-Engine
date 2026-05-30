import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";
import { isChapterHeadingText } from "../src/lib/books/book-chapters";

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

  const { data: chapters } = await admin
    .from("book_chapters")
    .select("*")
    .eq("book_id", bookId)
    .order("sort_order");
  console.log("book_chapters", chapters?.length, chapters?.map((c) => c.title));

  const { data: chLines } = await admin
    .from("tagged_lines")
    .select("line_order, line_text")
    .eq("book_id", bookId)
    .ilike("line_text", "Chapter%")
    .order("line_order")
    .limit(30);
  console.log("Chapter% lines in DB:", chLines?.length);
  chLines?.forEach((l) =>
    console.log(l.line_order, JSON.stringify(l.line_text), isChapterHeadingText(l.line_text))
  );

  const { count } = await admin
    .from("tagged_lines")
    .select("*", { count: "exact", head: true })
    .eq("book_id", bookId);
  console.log("total lines", count);

  const { data: book } = await admin
    .from("books")
    .select("*")
    .eq("id", bookId)
    .single();
  console.log("book import stats", {
    import_word_coverage: book?.import_word_coverage,
    import_line_count: book?.import_line_count,
    import_chapter_count: book?.import_chapter_count,
    analyzed_at: book?.analyzed_at,
    status: book?.status,
    manuscript_path: book?.manuscript_path,
  });
}

main().catch(console.error);
