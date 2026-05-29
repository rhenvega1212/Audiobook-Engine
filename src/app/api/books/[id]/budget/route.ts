import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/api/auth";
import { DEFAULT_AI_BUDGET_USD } from "@/lib/books/ai-budget";

const schema = z.object({
  ai_budget_usd: z.number().min(0).max(10_000),
  reset_spend: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireUser();
  if (!user) return error;

  const { id } = await params;
  const body = schema.parse(await request.json());
  const supabase = await createClient();

  const updates: Record<string, number> = {
    ai_budget_usd: body.ai_budget_usd,
  };
  if (body.reset_spend) updates.ai_spend_usd = 0;

  const { data, error: updateError } = await supabase
    .from("books")
    .update(updates)
    .eq("id", id)
    .select("ai_budget_usd, ai_spend_usd")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    ai_budget_usd: data?.ai_budget_usd ?? DEFAULT_AI_BUDGET_USD,
    ai_spend_usd: data?.ai_spend_usd ?? 0,
  });
}
