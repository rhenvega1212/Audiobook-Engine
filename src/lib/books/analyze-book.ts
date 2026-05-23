import { createAdminClient } from "@/lib/supabase/admin";
import { createEngineCharacter } from "@/lib/engine/types";
import { processManuscript } from "@/lib/engine/rules-engine";
import mammoth from "mammoth";

export async function analyzeBook(bookId: string) {
  const admin = createAdminClient();

  await admin.from("books").update({ status: "analyzing" }).eq("id", bookId);

  const { data: book, error: bookError } = await admin
    .from("books")
    .select("*, series_id")
    .eq("id", bookId)
    .single();

  if (bookError || !book) throw new Error(bookError?.message ?? "Book not found");

  const { data: chars } = await admin
    .from("characters")
    .select("*")
    .eq("series_id", book.series_id);

  const roster = (chars ?? []).map((c) =>
    createEngineCharacter(c.canonical_name, c.aliases ?? [], c.gender)
  );

  if (!book.manuscript_path) throw new Error("No manuscript uploaded");

  const { data: fileData, error: downloadError } = await admin.storage
    .from("manuscripts")
    .download(book.manuscript_path);

  if (downloadError || !fileData) {
    throw new Error(downloadError?.message ?? "Download failed");
  }

  const buffer = Buffer.from(await fileData.arrayBuffer());
  const { value: text } = await mammoth.extractRawText({ buffer });

  const result = processManuscript(text, roster);

  await admin.from("tagged_lines").delete().eq("book_id", bookId);
  await admin.from("book_characters").delete().eq("book_id", bookId);

  const speakerToCharId = new Map<string, string>();
  for (const c of chars ?? []) {
    speakerToCharId.set(c.canonical_name, c.id);
    for (const alias of c.aliases ?? []) {
      speakerToCharId.set(alias, c.id);
    }
  }

  const lineCounts = new Map<string, number>();
  const rows = result.lines.map((line, idx) => {
    let speakerLabel = line.speaker;
    let speakerCharId: string | null = null;

    if (line.speaker === "Narrator") {
      speakerLabel = "Narrator";
    } else if (line.speaker === "UNKNOWN") {
      speakerLabel = "UNKNOWN";
    } else {
      const char = (chars ?? []).find((c) =>
        c.canonical_name.toLowerCase() === line.speaker.toLowerCase()
      );
      if (char) {
        speakerCharId = char.id;
        speakerLabel = char.canonical_name;
        lineCounts.set(char.id, (lineCounts.get(char.id) ?? 0) + 1);
      }
    }

    return {
      book_id: bookId,
      line_order: idx,
      paragraph_num: line.paragraph_num,
      speaker_character_id: speakerCharId,
      speaker_label: speakerLabel,
      line_text: line.line,
      confidence: line.confidence,
      flag_reason: line.flag_reason,
      ai_reviewed: false,
      human_reviewed: false,
    };
  });

  if (rows.length > 0) {
    const { error: insertError } = await admin.from("tagged_lines").insert(rows);
    if (insertError) throw new Error(insertError.message);
  }

  for (const unknown of result.unknown_speakers) {
    const { data: existing } = await admin
      .from("characters")
      .select("id")
      .eq("series_id", book.series_id)
      .eq("canonical_name", unknown)
      .maybeSingle();

    if (!existing) {
      const { data: newChar } = await admin
        .from("characters")
        .insert({
          series_id: book.series_id,
          canonical_name: unknown,
          gender: "unknown",
        })
        .select("id")
        .single();

      if (newChar) {
        const count = result.lines.filter((l) => l.speaker === unknown).length;
        lineCounts.set(newChar.id, count);
      }
    }
  }

  const bookCharRows = [...lineCounts.entries()].map(([character_id, line_count]) => ({
    book_id: bookId,
    character_id,
    line_count,
  }));

  if (bookCharRows.length > 0) {
    await admin.from("book_characters").insert(bookCharRows);
  }

  const allCast = (chars ?? []).every((c) => c.elevenlabs_voice_id);
  const hasFlags = result.flagged_count > 0;
  const newStatus = allCast && !hasFlags ? "ready_for_review" : "needs_casting";

  await admin.from("books").update({ status: newStatus }).eq("id", bookId);

  return {
    total_lines: result.total_lines,
    flagged_count: result.flagged_count,
    unknown_speakers: result.unknown_speakers,
    status: newStatus,
  };
}
