-- Persist every human correction to speaker attribution as reusable signal.
-- One row per fix, captured at edit time (before the wrong guess is overwritten).
-- This single dataset serves three purposes:
--   1. Few-shot examples injected into future AI attribution prompts (per series),
--      so the model learns each author's dialogue conventions.
--   2. Alias / gender learning for the free rules engine.
--   3. Ground truth for the accuracy benchmark.
-- Rows are scoped to a series so one author's writing style never bleeds into
-- another author's books.
create table if not exists attribution_corrections (
  id uuid primary key default gen_random_uuid(),
  series_id uuid references series(id) on delete cascade,
  book_id uuid references books(id) on delete set null,
  line_id uuid,
  line_order int,
  paragraph_num int,
  line_text text not null,
  context_before text,
  context_after text,
  source_paragraph text,
  -- What the system had before the human fix, and what the human set it to.
  wrong_speaker text,
  correct_speaker text not null,
  wrong_character_id uuid,
  correct_character_id uuid,
  -- Signal quality: an override of an AI suggestion is a stronger teaching example.
  was_ai_reviewed boolean default false,
  prior_confidence text,
  prior_flag_reason text,
  -- Optional pattern label (e.g. continuation, two_person_alternation,
  -- name_in_quote, split_quote). Filled in later by a summarization pass.
  correction_type text,
  created_at timestamptz default now()
);

create index if not exists attribution_corrections_series_idx
  on attribution_corrections (series_id);
create index if not exists attribution_corrections_book_idx
  on attribution_corrections (book_id);
