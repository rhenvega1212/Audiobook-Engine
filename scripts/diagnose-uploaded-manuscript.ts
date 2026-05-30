import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import {
  extractManuscriptParagraphs,
  extractBlocksFromHtml,
} from "../src/lib/engine/manuscript-extract";
import { processManuscriptFromParagraphs } from "../src/lib/engine/rules-engine";
import { detectChapterStarts } from "../src/lib/books/book-chapters";
import { createEngineCharacter } from "../src/lib/engine/types";
import mammoth from "mammoth";

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

  const { data: book } = await admin
    .from("books")
    .select("manuscript_path")
    .eq("id", bookId)
    .single();

  const { data: fileData, error } = await admin.storage
    .from("manuscripts")
    .download(book!.manuscript_path!);

  if (error || !fileData) throw error ?? new Error("download failed");

  const buffer = Buffer.from(await fileData.arrayBuffer());
  writeFileSync("/tmp/uploaded-manuscript.docx", buffer);

  const { value: html } = await mammoth.convertToHtml({ buffer });
  const blocks = extractBlocksFromHtml(html);
  const chapterBlocks = blocks.filter((b) => /^Chapter \d+$/i.test(b.text.trim()));
  console.log("Uploaded docx blocks:", blocks.length);
  console.log("Exact 'Chapter N' blocks:", chapterBlocks.length);
  chapterBlocks.slice(0, 10).forEach((b) => console.log(JSON.stringify(b.text)));

  const htags = [...html.matchAll(/<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi)];
  console.log("h1-h6 tags:", htags.length);
  htags
    .filter((m) => /chapter/i.test(m[2]!))
    .slice(0, 10)
    .forEach((m) => console.log(m[1], m[2]!.replace(/<[^>]+>/g, "")));

  const { paragraphs } = await extractManuscriptParagraphs(buffer);
  const result = processManuscriptFromParagraphs(paragraphs, [
    createEngineCharacter("N", [], "unknown"),
  ]);
  const chLines = result.lines.filter((l) => /^Chapter \d+/i.test(l.line.trim()));
  console.log("Processed chapter lines:", chLines.length);
  chLines.slice(0, 5).forEach((l) => console.log(l.line));

  const fakeLines = result.lines.map((l, i) => ({
    id: String(i),
    line_order: i,
    line_text: l.line,
  }));
  console.log("detectChapterStarts:", detectChapterStarts(fakeLines).length);
}

main().catch(console.error);
