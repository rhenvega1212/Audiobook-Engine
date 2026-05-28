-- Editable chapter structure per book (auto-filled on analyze + manual marks in studio)
create table book_chapters (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  sort_order int not null,
  title text not null,
  start_line_id uuid references tagged_lines(id) on delete set null,
  start_line_order int not null,
  source text not null default 'auto' check (source in ('auto', 'manual')),
  created_at timestamptz default now()
);

create index book_chapters_book_sort_idx on book_chapters (book_id, sort_order);
create index book_chapters_book_start_line_idx on book_chapters (book_id, start_line_order);

alter table book_chapters enable row level security;

create policy "book_chapters_authenticated"
  on book_chapters for all
  to authenticated
  using (true)
  with check (true);
