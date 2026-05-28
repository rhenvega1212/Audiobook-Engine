/**
 * End-to-end workflow test (no browser auth).
 * Run: npx tsx scripts/workflow-test.ts
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import mammoth from "mammoth";
import { createClient } from "@supabase/supabase-js";
import { analyzeBook } from "../src/lib/books/analyze-book";
import { processManuscript } from "../src/lib/engine/rules-engine";
import { createEngineCharacter } from "../src/lib/engine/types";
import { fetchAllTaggedLines } from "../src/lib/supabase/fetch-all";
import { isValidNewCharacter } from "../src/lib/engine/unknown-speaker";

const KEEP_BOOK = process.argv.includes("--keep");
const MANUSCRIPT = resolve(
  process.env.HOME ?? "",
  "Downloads/MURDER BY THE GLASS_10_09_20_Liza.docx"
);

function loadEnv() {
  const path = resolve(process.cwd(), ".env.local");
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
}

function log(message: string, data: Record<string, unknown>) {
  console.log(message, data);
}

async function main() {
  loadEnv();
  const results: { step: string; ok: boolean; detail?: string }[] = [];

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(supabaseUrl, serviceKey);

  // H1: manuscript file readable
  let buffer: Buffer;
  try {
    buffer = readFileSync(MANUSCRIPT);
    log("file read ok", {
      bytes: buffer.length,
      path: MANUSCRIPT,
    });
    results.push({ step: "read_manuscript", ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("file read failed", { error: msg });
    results.push({ step: "read_manuscript", ok: false, detail: msg });
    printSummary(results);
    process.exit(1);
  }

  // H2: mammoth text extraction
  let text = "";
  try {
    const { value } = await mammoth.extractRawText({ buffer });
    text = value;
    log("extract ok", {
      charCount: text.length,
      lineCount: text.split("\n").length,
    });
    results.push({ step: "mammoth_extract", ok: text.length > 1000 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("extract failed", { error: msg });
    results.push({ step: "mammoth_extract", ok: false, detail: msg });
  }

  // H3: Supabase series + characters seeded
  const { data: series, error: seriesErr } = await admin
    .from("series")
    .select("id, name, pen_names(name)")
    .eq("name", "Wine Lover's Mysteries")
    .maybeSingle();

  if (seriesErr || !series) {
    log("series missing", {
      error: seriesErr?.message ?? "not found",
    });
    results.push({
      step: "seed_series",
      ok: false,
      detail: seriesErr?.message ?? "Wine Lover's Mysteries not in DB",
    });
    printSummary(results);
    process.exit(1);
  }

  const { data: chars, error: charsErr } = await admin
    .from("characters")
    .select("*")
    .eq("series_id", series.id);

  log("series loaded", {
    seriesId: series.id,
    characterCount: chars?.length ?? 0,
  });
  results.push({
    step: "seed_series",
    ok: (chars?.length ?? 0) >= 5,
    detail: `${chars?.length ?? 0} characters`,
  });

  const roster = (chars ?? []).map((c) =>
    createEngineCharacter(c.canonical_name, c.aliases ?? [], c.gender)
  );

  // H4: rules engine on manuscript (offline)
  let engineResult: ReturnType<typeof processManuscript> | null = null;
  if (text) {
    engineResult = processManuscript(text, roster);
    log("processManuscript done", {
      total_lines: engineResult.total_lines,
      flagged_count: engineResult.flagged_count,
      unknown_speakers: engineResult.unknown_speakers.slice(0, 20),
      unknown_count: engineResult.unknown_speakers.length,
    });
    const validUnknown = engineResult.unknown_speakers.filter((u) =>
      isValidNewCharacter(
        u,
        engineResult!.lines.filter((l) => l.speaker === u).length
      )
    );
    results.push({
      step: "rules_engine",
      ok: engineResult.total_lines > 0,
      detail: `${engineResult.total_lines} lines, ${engineResult.flagged_count} flagged, ${validUnknown.length}/${engineResult.unknown_speakers.length} valid unknown`,
    });
  }

  // H5: storage upload + analyzeBook (full pipeline)
  const testTitle = "Workflow Test Murder by the Glass";
  const { data: book, error: bookErr } = await admin
    .from("books")
    .insert({
      series_id: series.id,
      title: testTitle,
      status: "uploaded",
    })
    .select()
    .single();

  if (bookErr || !book) {
    log("book insert failed", {
      error: bookErr?.message,
    });
    results.push({ step: "create_book", ok: false, detail: bookErr?.message });
    printSummary(results);
    process.exit(1);
  }

  const path = `${series.id}/${book.id}/manuscript.docx`;
  const { error: uploadError } = await admin.storage
    .from("manuscripts")
    .upload(path, buffer, {
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    });

  if (uploadError) {
    log("upload failed", {
      error: uploadError.message,
    });
    results.push({ step: "storage_upload", ok: false, detail: uploadError.message });
    await admin.from("books").delete().eq("id", book.id);
    printSummary(results);
    process.exit(1);
  }

  await admin
    .from("books")
    .update({ manuscript_path: path })
    .eq("id", book.id);

  const { data: downloaded, error: dlErr } = await admin.storage
    .from("manuscripts")
    .download(path);
  if (dlErr || !downloaded) {
    log("download after upload failed", {
      error: dlErr?.message,
    });
    results.push({
      step: "storage_roundtrip",
      ok: false,
      detail: dlErr?.message ?? "download failed",
    });
  } else {
    const dlBytes = Buffer.from(await downloaded.arrayBuffer()).length;
    const sizeMatch = dlBytes === buffer.length;
    log("storage roundtrip size", {
      uploadedBytes: buffer.length,
      downloadedBytes: dlBytes,
      sizeMatch,
    });
    results.push({
      step: "storage_roundtrip",
      ok: sizeMatch,
      detail: `${dlBytes} vs ${buffer.length} bytes`,
    });
  }

  let analyzeSummary: Awaited<ReturnType<typeof analyzeBook>> | null = null;
  try {
    analyzeSummary = await analyzeBook(book.id);
    log("analyzeBook ok", {
      bookId: book.id,
      ...analyzeSummary,
    });
    results.push({
      step: "analyze_book",
      ok: true,
      detail: JSON.stringify(analyzeSummary),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("analyzeBook failed", {
      bookId: book.id,
      error: msg,
    });
    results.push({ step: "analyze_book", ok: false, detail: msg });
  }

  // H6: voice IDs seeded (export readiness)
  const missingVoices = (chars ?? []).filter(
    (c) =>
      c.canonical_name !== "Narrator" &&
      c.elevenlabs_voice_name &&
      !c.elevenlabs_voice_id
  );
  log("voice id check", {
    missingCount: missingVoices.length,
    missing: missingVoices.map((c) => c.canonical_name),
  });
  results.push({
    step: "voice_ids_seeded",
    ok: missingVoices.length === 0,
    detail:
      missingVoices.length === 0
        ? "all cast"
        : `missing: ${missingVoices.map((c) => c.canonical_name).join(", ")}`,
  });

  // H7: ElevenLabs API
  const elevenKey = process.env.ELEVENLABS_API_KEY;
  if (elevenKey) {
    try {
      const res = await fetch("https://api.elevenlabs.io/v1/voices", {
        headers: { "xi-api-key": elevenKey },
      });
      const body = await res.json().catch(() => ({}));
      log("voices api", {
        status: res.status,
        voiceCount: Array.isArray(body.voices) ? body.voices.length : 0,
      });
      results.push({
        step: "elevenlabs_api",
        ok: res.ok,
        detail: `HTTP ${res.status}`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ step: "elevenlabs_api", ok: false, detail: msg });
    }
  }

  // H8: tagged_lines persisted (paginated fetch — must match total_lines)
  if (book.id && analyzeSummary) {
    let lines: { flag_reason: string | null }[] = [];
    try {
      lines = await fetchAllTaggedLines(admin, book.id, "id, flag_reason");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ step: "tagged_lines_db", ok: false, detail: msg });
    }
    const flagged = lines.filter((l) => l.flag_reason);
    const lineOk = lines.length === analyzeSummary.total_lines;
    log("tagged_lines check", {
      lineCount: lines.length,
      expected: analyzeSummary.total_lines,
      flaggedCount: flagged.length,
    });
    results.push({
      step: "tagged_lines_db",
      ok: lineOk && lines.length > 0,
      detail: `${lines.length}/${analyzeSummary.total_lines} lines, ${flagged.length} flagged`,
    });

    const junkCreates = analyzeSummary.unknown_speakers.filter((u) =>
      isValidNewCharacter(
        u,
        engineResult?.lines.filter((l) => l.speaker === u).length ?? 0
      )
    );
    log("filtered unknown speakers", {
      raw: analyzeSummary.unknown_speakers.length,
      wouldCreate: junkCreates.length,
      sample: junkCreates.slice(0, 10),
    });

    const { data: updatedBook } = await admin
      .from("books")
      .select("status")
      .eq("id", book.id)
      .single();
    const status = updatedBook?.status ?? "unknown";
    const statusOk = [
      "needs_casting",
      "reviewing",
      "ready_for_export",
    ].includes(status);
    results.push({
      step: "book_status",
      ok: statusOk,
      detail: `${status}, ai_cleared=${analyzeSummary.ai_review?.lines_cleared ?? 0}`,
    });
  }

  if (KEEP_BOOK || !analyzeSummary) {
    log("test book kept", {
      bookId: book.id,
      title: testTitle,
      path,
    });
    console.log(`\nKept test book: ${testTitle}`);
    console.log(`  id: ${book.id}`);
    console.log(`  /books/${book.id}`);
  } else {
    await admin.from("tagged_lines").delete().eq("book_id", book.id);
    await admin.from("book_characters").delete().eq("book_id", book.id);
    await admin.storage.from("manuscripts").remove([path]);
    await admin.from("books").delete().eq("id", book.id);
    log("test book removed", { bookId: book.id });
  }

  printSummary(results);
  const failed = results.filter((r) => !r.ok);
  process.exit(failed.length > 0 ? 1 : 0);
}

function printSummary(results: { step: string; ok: boolean; detail?: string }[]) {
  console.log("\n=== WORKFLOW TEST SUMMARY ===");
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.step}${r.detail ? ` — ${r.detail}` : ""}`);
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
