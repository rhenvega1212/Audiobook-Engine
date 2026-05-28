import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/api/auth";
import { fetchAllPages } from "@/lib/supabase/fetch-all";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id } = await params;
  const speaker = new URL(request.url).searchParams.get("speaker");

  if (!speaker) {
    return NextResponse.json({ error: "speaker is required" }, { status: 400 });
  }

  const supabase = await createClient();

  try {
    const lines = await fetchAllPages<{
      id: string;
      line_order: number;
      speaker_label: string;
      line_text: string;
      flag_reason: string | null;
    }>(async (from, to) => {
      const { data, error: dbError } = await supabase
        .from("tagged_lines")
        .select("id, line_order, speaker_label, line_text, flag_reason")
        .eq("book_id", id)
        .eq("speaker_label", speaker)
        .order("line_order")
        .range(from, to);
      return { data, error: dbError };
    });

    return NextResponse.json({ lines, count: lines.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load lines";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
