-- Series-scoped pronunciation dictionary + per-line spoken overrides for export

create table pronunciations (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references series(id) on delete cascade,
  word text not null,
  spoken_form text not null,
  notes text,
  created_at timestamptz default now()
);

create unique index pronunciations_series_word_lower_idx
  on pronunciations (series_id, lower(word));

alter table tagged_lines
  add column if not exists spoken_text text;

alter table pronunciations enable row level security;

create policy "Authenticated full access"
  on pronunciations for all
  to authenticated
  using (true)
  with check (true);
