# Accuracy update — locked decisions (May 2026)

## Product goals

- **~90%** of dialogue correct without human edit after rules + AI.
- **Assign always; flag when not fully confident** (rules `medium`/`low`/inferred, roster gaps, first-name resolution).
- **Human queue** = flagged lines only (Review + Manuscript studio).
- **Re-analyze existing production books** (replaces tagged lines; manual line edits unless preserved later).
- **Golden chapter benchmark** — after first deploy; not blocking v1.

## Workflow

| Step | Behavior |
|------|----------|
| Pre-analyze | Block analyze until series **narrator, protagonist, series_regular, recurring** each have ≥1 alias (or two-word canonical + implicit first-name alias). |
| Upload | Rules analyze → **client batched AI review** → redirect to **`/books/{id}/review`**. |
| Review | Assign speaker; **Open in manuscript studio** (existing) for surrounding context. |
| Accept AI | **Preview list** → adjust exclusions → bulk clear selected. |
| Budget | Default **$500/book**; user-editable cap; stop AI batches when estimated spend ≥ cap. |

## Anthropic / Vercel

- `.env.local` is **local only**. Production needs the same vars in **Vercel → Project → Settings → Environment Variables** (`ANTHROPIC_API_KEY`, optional `ANTHROPIC_MODEL`).
- **Credits**: reload at [console.anthropic.com](https://console.anthropic.com) → Billing. The app tracks **estimated spend per book**; it does not purchase credits.
- **Low balance**: watch Anthropic dashboard; optional future: email when book spend hits 80% of cap.

## Implementation phases

### Phase 1 — Rules engine ✅ (in progress)

- Flag `medium`, unmapped roster, first-name-only resolution.
- `resolveFirstNameToCanonical` when one roster match.

### Phase 2 — Pipeline

- Analyze readiness API + gate on `/api/books/[id]/analyze`.
- Upload: client `runBatchAiReview` after analyze.
- `scripts/reanalyze-all-books.ts` for production re-run.

### Phase 3 — UX

- Accept AI preview modal on Review.
- Book detail: AI budget field.
- README deploy note for Vercel keys.

### Phase 4 — Later

- Golden chapter regression script.
- Preserve `human_reviewed` on re-analyze (if needed).
