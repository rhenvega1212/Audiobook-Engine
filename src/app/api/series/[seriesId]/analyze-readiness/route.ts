import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/api/auth";
import { checkSeriesAnalyzeReadiness } from "@/lib/characters/analyze-readiness";
import type { Character } from "@/lib/types/database";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ seriesId: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { seriesId } = await params;
  const supabase = await createClient();

  const { data: characters, error: charError } = await supabase
    .from("characters")
    .select("id, canonical_name, aliases, role")
    .eq("series_id", seriesId);

  if (charError) {
    return NextResponse.json({ error: charError.message }, { status: 500 });
  }

  const result = checkSeriesAnalyzeReadiness((characters ?? []) as Character[]);
  return NextResponse.json(result);
}
