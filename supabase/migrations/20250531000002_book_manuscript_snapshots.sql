-- Full manuscript checkpoints for undo (manual edits, AI review, cleanup deletes).
create table if not exists book_manuscript_snapshots (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  label text not null default 'Checkpoint',
  source text not null default 'manual',
  line_count int not null default 0,
  created_at timestamptz not null default now(),
  lines jsonb not null
);

create index if not exists book_manuscript_snapshots_book_created_idx
  on book_manuscript_snapshots (book_id, created_at desc);
