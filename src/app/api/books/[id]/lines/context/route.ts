import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/api/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id } = await params;
  const url = new URL(request.url);
  const lineId = url.searchParams.get("line_id");
  const lineOrderParam = url.searchParams.get("line_order");
  const before = Math.min(
    Math.max(parseInt(url.searchParams.get("before") ?? "8", 10) || 8, 0),
    30
  );
  const after = Math.min(
    Math.max(parseInt(url.searchParams.get("after") ?? "8", 10) || 8, 0),
    30
  );

  if (!lineId && lineOrderParam == null) {
    return NextResponse.json(
      { error: "line_id or line_order is required" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  let targetOrder: number;
  let targetId: string;

  if (lineId) {
    const { data: target, error: targetError } = await supabase
      .from("tagged_lines")
      .select("id, line_order")
      .eq("book_id", id)
      .eq("id", lineId)
      .maybeSingle();

    if (targetError) {
      return NextResponse.json({ error: targetError.message }, { status: 500 });
    }
    if (!target) {
      return NextResponse.json({ error: "Line not found" }, { status: 404 });
    }
    targetOrder = target.line_order;
    targetId = target.id;
  } else {
    targetOrder = parseInt(lineOrderParam!, 10);
    const { data: target, error: targetError } = await supabase
      .from("tagged_lines")
      .select("id, line_order")
      .eq("book_id", id)
      .eq("line_order", targetOrder)
      .maybeSingle();

    if (targetError) {
      return NextResponse.json({ error: targetError.message }, { status: 500 });
    }
    if (!target) {
      return NextResponse.json({ error: "Line not found" }, { status: 404 });
    }
    targetId = target.id;
  }

  const { data: lines, error: linesError } = await supabase
    .from("tagged_lines")
    .select("id, line_order, speaker_label, line_text, flag_reason, speaker_character_id")
    .eq("book_id", id)
    .gte("line_order", targetOrder - before)
    .lte("line_order", targetOrder + after)
    .order("line_order");

  if (linesError) {
    return NextResponse.json({ error: linesError.message }, { status: 500 });
  }

  return NextResponse.json({
    lines: lines ?? [],
    target_id: targetId,
    target_order: targetOrder,
  });
}
