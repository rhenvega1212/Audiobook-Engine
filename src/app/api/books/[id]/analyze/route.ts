import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/api/auth";
import { analyzeBook } from "@/lib/books/analyze-book";
import { checkSeriesAnalyzeReadiness } from "@/lib/characters/analyze-readiness";
import type { Character } from "@/lib/types/database";

export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id } = await params;

  let runAiReview = false;
  try {
    const body = await request.json().catch(() => ({}));
    if (body.run_ai_review === true) {
      runAiReview = true;
    }
  } catch {
    // empty body — skip AI review for faster, reliable re-runs
  }

  try {
    const supabase = await createClient();
    const { data: book } = await supabase
      .from("books")
      .select("series_id")
      .eq("id", id)
      .single();

    if (book?.series_id) {
      const { data: characters } = await supabase
        .from("characters")
        .select("id, canonical_name, aliases, role")
        .eq("series_id", book.series_id);

      const readiness = checkSeriesAnalyzeReadiness(
        (characters ?? []) as Character[]
      );
      if (!readiness.ready) {
        return NextResponse.json(
          {
            error:
              "Add aliases for all series regulars before analyzing. Open Character Library for this series.",
            readiness,
          },
          { status: 400 }
        );
      }
    }

    const summary = await analyzeBook(id, { runAiReview });
    return NextResponse.json(summary);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
