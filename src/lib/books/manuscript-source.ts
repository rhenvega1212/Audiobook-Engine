import { extractManuscriptBlocks } from "@/lib/engine/manuscript-extract";
import type { createAdminClient } from "@/lib/supabase/admin";

/** Verbatim paragraph strings from the uploaded .docx (includes quotation marks). */
export async function fetchSourceParagraphs(
  admin: ReturnType<typeof createAdminClient>,
  bookId: string
): Promise<string[] | null> {
  const { data: book, error: bookError } = await admin
    .from("books")
    .select("manuscript_path")
    .eq("id", bookId)
    .single();

  if (bookError || !book?.manuscript_path) return null;

  const { data: fileData, error: downloadError } = await admin.storage
    .from("manuscripts")
    .download(book.manuscript_path);

  if (downloadError || !fileData) return null;

  const buffer = Buffer.from(await fileData.arrayBuffer());
  const { paragraphs } = await extractManuscriptBlocks(buffer);
  return paragraphs;
}
