-- Capture the series character roster (voices, aliases, deleted rows) inside
-- undo checkpoints so operations like character merges can be fully reversed,
-- not just the manuscript lines.
alter table book_manuscript_snapshots
  add column if not exists characters jsonb;
