-- Point-in-time speaker state before an AI review run (for undo).
create table if not exists ai_review_snapshots (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  line_count int not null default 0,
  created_at timestamptz not null default now(),
  lines jsonb not null
);

create index if not exists ai_review_snapshots_book_created_idx
  on ai_review_snapshots (book_id, created_at desc);
