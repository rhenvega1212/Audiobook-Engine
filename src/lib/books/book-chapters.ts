import type { SupabaseClient } from "@supabase/supabase-js";
import { CHAPTER_HEADING_RE, CHAPTER_NUMBER_RE } from "@/lib/engine/regex";
import { fetchAllTaggedLines } from "@/lib/supabase/fetch-all";
import type { ManuscriptChapter } from "@/lib/manuscript/chapters";

export type BookChapterRow = {
  id: string;
  book_id: string;
  sort_order: number;
  title: string;
  start_line_id: string | null;
  start_line_order: number;
  source: "auto" | "manual";
};

type LineSlice = {
  id: string;
  line_order: number;
  line_text: string;
  paragraph_num?: number;
};

export function isChapterHeadingText(text: string): boolean {
  const t = text.trim().replace(/\u00a0/g, " ");
  if (!t) return false;
  if (CHAPTER_HEADING_RE.test(t)) return true;
  if (CHAPTER_NUMBER_RE.test(t)) return true;
  return false;
}

function chapterTitleFromLine(text: string): string {
  const t = text.trim();
  return t.length > 72 ? `${t.slice(0, 72)}…` : t;
}

/** Detect chapter start lines from manuscript text. */
export function detectChapterStarts(
  lines: LineSlice[],
  options?: { chapterParagraphNums?: Set<number> }
): { start_line_id: string; start_line_order: number; title: string }[] {
  const starts: { start_line_id: string; start_line_order: number; title: string }[] =
    [];
  const seenOrders = new Set<number>();

  for (const line of lines) {
    const fromText = isChapterHeadingText(line.line_text);
    const fromBlock =
      options?.chapterParagraphNums?.has(line.paragraph_num ?? -1) ?? false;

    if (!fromText && !fromBlock) continue;
    if (seenOrders.has(line.line_order)) continue;
    seenOrders.add(line.line_order);

    starts.push({
      start_line_id: line.id,
      start_line_order: line.line_order,
      title: chapterTitleFromLine(line.line_text),
    });
  }

  if (starts.length === 0 && lines.length > 0) {
    return [
      {
        start_line_id: lines[0]!.id,
        start_line_order: lines[0]!.line_order,
        title: "Full manuscript",
      },
    ];
  }

  // Lines before the first numbered chapter (prologue, front matter, etc.)
  if (
    starts.length > 0 &&
    starts[0]!.start_line_order > (lines[0]?.line_order ?? 0)
  ) {
    starts.unshift({
      start_line_id: lines[0]!.id,
      start_line_order: lines[0]!.line_order,
      title: "Front matter",
    });
  }

  return starts;
}

export function chaptersFromRecords(
  records: Pick<
    BookChapterRow,
    "id" | "title" | "start_line_order" | "start_line_id"
  >[],
  lines: LineSlice[]
): ManuscriptChapter[] {
  if (records.length === 0) return [];

  const sorted = [...records].sort(
    (a, b) => a.start_line_order - b.start_line_order
  );
  const maxOrder = lines[lines.length - 1]?.line_order ?? 0;

  return sorted.map((ch, i) => {
    const next = sorted[i + 1];
    const endLineOrder = next ? next.start_line_order - 1 : maxOrder;
    const firstLineId =
      ch.start_line_id ??
      lines.find((l) => l.line_order === ch.start_line_order)?.id ??
      lines[0]!.id;

    return {
      id: ch.id,
      title: ch.title,
      startLineOrder: ch.start_line_order,
      endLineOrder: endLineOrder,
      firstLineId,
      lineCount: lines.filter(
        (l) =>
          l.line_order >= ch.start_line_order &&
          l.line_order <= endLineOrder
      ).length,
    };
  });
}

export async function rebuildAutoBookChapters(
  admin: SupabaseClient,
  bookId: string,
  options?: { chapterParagraphNums?: Set<number> }
): Promise<number> {
  const lines = await fetchAllTaggedLines<LineSlice>(
    admin,
    bookId,
    "id, line_order, line_text, paragraph_num"
  );

  await admin.from("book_chapters").delete().eq("book_id", bookId);

  const starts = detectChapterStarts(lines, options);
  if (starts.length === 0) return 0;

  const rows = starts.map((s, i) => ({
    book_id: bookId,
    sort_order: i,
    title: s.title,
    start_line_id: s.start_line_id,
    start_line_order: s.start_line_order,
    source: "auto" as const,
  }));

  const { error } = await admin.from("book_chapters").insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

export async function addManualChapterStart(
  admin: SupabaseClient,
  bookId: string,
  lineId: string,
  title: string
): Promise<BookChapterRow[]> {
  const { data: line, error: lineError } = await admin
    .from("tagged_lines")
    .select("id, line_order, line_text, book_id")
    .eq("id", lineId)
    .eq("book_id", bookId)
    .maybeSingle();

  if (lineError) throw new Error(lineError.message);
  if (!line) throw new Error("Line not found");

  const chapterTitle = title.trim() || chapterTitleFromLine(line.line_text);

  const { data: existing } = await admin
    .from("book_chapters")
    .select("id")
    .eq("book_id", bookId)
    .eq("start_line_order", line.line_order)
    .maybeSingle();

  if (existing) {
    const { error: updError } = await admin
      .from("book_chapters")
      .update({ title: chapterTitle, source: "manual" })
      .eq("id", existing.id);
    if (updError) throw new Error(updError.message);
  } else {
    const { error: insError } = await admin.from("book_chapters").insert({
      book_id: bookId,
      sort_order: 0,
      title: chapterTitle,
      start_line_id: line.id,
      start_line_order: line.line_order,
      source: "manual",
    });
    if (insError) throw new Error(insError.message);
  }

  return resyncChapterSortOrders(admin, bookId);
}

async function resyncChapterSortOrders(
  admin: SupabaseClient,
  bookId: string
): Promise<BookChapterRow[]> {
  const { data: chapters, error } = await admin
    .from("book_chapters")
    .select("*")
    .eq("book_id", bookId)
    .order("start_line_order");

  if (error) throw new Error(error.message);
  const sorted = (chapters ?? []) as BookChapterRow[];

  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i]!.sort_order !== i) {
      await admin
        .from("book_chapters")
        .update({ sort_order: i })
        .eq("id", sorted[i]!.id);
      sorted[i]!.sort_order = i;
    }
  }

  return sorted;
}
