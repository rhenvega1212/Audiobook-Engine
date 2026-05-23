import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { analyzeBook } from "@/lib/books/analyze-book";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id } = await params;

  try {
    const summary = await analyzeBook(id);
    return NextResponse.json(summary);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
