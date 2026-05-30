import { readFileSync } from "fs";
import { resolve } from "path";
import { analyzeBook } from "../src/lib/books/analyze-book";

function loadEnv() {
  for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
}

async function main() {
  loadEnv();
  const bookId = process.argv[2] ?? "e40955b2-1a40-48a1-b9ab-67de6781a5c9";
  console.log("Analyzing", bookId, "...");
  const result = await analyzeBook(bookId, { runAiReview: false });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
