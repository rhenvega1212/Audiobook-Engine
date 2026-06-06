import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy /read URLs → manuscript studio (full book editor). */
export default async function ReadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ line?: string; flagged?: string }>;
}) {
  const { id } = await params;
  const { line: lineId, flagged } = await searchParams;

  const supabase = await createClient();
  const { data: book } = await supabase
    .from("books")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (!book) notFound();

  if (lineId) {
    const qs = new URLSearchParams({ line: lineId });
    if (flagged === "1") qs.set("flagged", "1");
    redirect(`/books/${id}/manuscript?${qs.toString()}`);
  }

  if (flagged === "1") {
    redirect(`/books/${id}/manuscript?flagged=1`);
  }

  const { data: firstFlagged } = await supabase
    .from("tagged_lines")
    .select("id")
    .eq("book_id", id)
    .not("flag_reason", "is", null)
    .eq("human_reviewed", false)
    .order("line_order")
    .limit(1)
    .maybeSingle();

  if (firstFlagged) {
    redirect(`/books/${id}/manuscript?line=${firstFlagged.id}&flagged=1`);
  }

  redirect(`/books/${id}/manuscript`);
}
