import { readFileSync } from "fs";
import { resolve } from "path";
import mammoth from "mammoth";
import {
  extractManuscriptParagraphs,
  extractBlocksFromHtml,
} from "../src/lib/engine/manuscript-extract";
import { processManuscriptFromParagraphs } from "../src/lib/engine/rules-engine";
import {
  detectChapterStarts,
  isChapterHeadingText,
} from "../src/lib/books/book-chapters";
import { createEngineCharacter } from "../src/lib/engine/types";

const MANUSCRIPT = resolve(
  process.env.HOME ?? "",
  "Downloads/MURDER BY THE GLASS_10_09_20_Liza.docx"
);

async function main() {
  const buffer = readFileSync(MANUSCRIPT);
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const blocks = extractBlocksFromHtml(html);

  const chapterish = blocks.filter(
    (b) =>
      /chapter|prologue|epilogue|part /i.test(b.text) ||
      /^\d+\.?$/.test(b.text.trim())
  );
  console.log("Total blocks:", blocks.length);
  console.log("Chapter-ish blocks (first 40):");
  chapterish.slice(0, 40).forEach((b, i) =>
    console.log(i, JSON.stringify(b.text.slice(0, 100)))
  );

  const htags = [...html.matchAll(/<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi)];
  console.log("\nHTML h1-h6 count:", htags.length);
  htags.slice(0, 20).forEach((m) =>
    console.log(m[1], m[2]!.replace(/<[^>]+>/g, "").slice(0, 80))
  );

  const headingPs = [
    ...html.matchAll(
      /<p[^>]*class="[^"]*[Hh]eading[^"]*"[^>]*>([\s\S]*?)<\/p>/gi
    ),
  ];
  console.log("\nHeading class p count:", headingPs.length);
  headingPs.slice(0, 20).forEach((m) =>
    console.log(m[1]!.replace(/<[^>]+>/g, "").slice(0, 80))
  );

  const { paragraphs, rawText, blockCount } =
    await extractManuscriptParagraphs(buffer);
  console.log("\nExtract:", blockCount, "paragraphs, raw chars:", rawText.length);

  const roster = [createEngineCharacter("Narrator", [], "unknown")];
  const result = processManuscriptFromParagraphs(paragraphs, roster);
  const fakeLines = result.lines.map((l, i) => ({
    id: String(i),
    line_order: i,
    line_text: l.line,
  }));
  const starts = detectChapterStarts(fakeLines);
  console.log("\nDetected chapter starts:", starts.length);
  starts.slice(0, 25).forEach((s) =>
    console.log(s.start_line_order, s.title)
  );

  const missed = fakeLines.filter(
    (l) => /chapter/i.test(l.line_text) && !isChapterHeadingText(l.line_text)
  );
  console.log("\nMissed chapter-like lines:", missed.length);
  missed.slice(0, 20).forEach((l) =>
    console.log(JSON.stringify(l.line_text.slice(0, 120)))
  );

  // Show first 30 paragraph blocks
  console.log("\nFirst 30 extracted blocks:");
  paragraphs.slice(0, 30).forEach((p, i) =>
    console.log(i, JSON.stringify(p.slice(0, 100)))
  );
}

main().catch(console.error);
