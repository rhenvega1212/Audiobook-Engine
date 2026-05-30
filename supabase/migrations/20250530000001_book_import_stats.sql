-- Import / analyze metadata for book detail UI
ALTER TABLE books
  ADD COLUMN IF NOT EXISTS import_word_coverage numeric(5,4),
  ADD COLUMN IF NOT EXISTS import_paragraph_count integer,
  ADD COLUMN IF NOT EXISTS import_line_count integer,
  ADD COLUMN IF NOT EXISTS import_chapter_count integer,
  ADD COLUMN IF NOT EXISTS analyzed_at timestamptz;
