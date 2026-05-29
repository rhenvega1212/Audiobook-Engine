/** Rough USD estimate per Claude scene attribution call (Sonnet-scale). */
export const ESTIMATED_USD_PER_AI_SCENE = 0.08;

export const DEFAULT_AI_BUDGET_USD = 500;

export function canRunAiScene(
  spendUsd: number,
  budgetUsd: number,
  scenesToAdd = 1
): boolean {
  const cap = budgetUsd > 0 ? budgetUsd : DEFAULT_AI_BUDGET_USD;
  const next = spendUsd + scenesToAdd * ESTIMATED_USD_PER_AI_SCENE;
  return next <= cap + 1e-6;
}

export function budgetSummary(spendUsd: number, budgetUsd: number) {
  const cap = budgetUsd > 0 ? budgetUsd : DEFAULT_AI_BUDGET_USD;
  const remaining = Math.max(0, cap - spendUsd);
  const pct = cap > 0 ? Math.min(100, (spendUsd / cap) * 100) : 0;
  return { cap, spend: spendUsd, remaining, pctUsed: pct };
}
