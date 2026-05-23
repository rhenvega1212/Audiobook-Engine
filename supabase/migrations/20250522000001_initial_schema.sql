-- Pen names (Michele Scott, A.K. Alexander, etc.)
create table pen_names (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);

-- Series within a pen name
create table series (
  id uuid primary key default gen_random_uuid(),
  pen_name_id uuid references pen_names(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz default now()
);

-- Characters scoped to a series
create table characters (
  id uuid primary key default gen_random_uuid(),
  series_id uuid references series(id) on delete cascade,
  canonical_name text not null,
  aliases text[] default '{}',
  gender text check (gender in ('male', 'female', 'unknown')) default 'unknown',
  description text,
  elevenlabs_voice_id text,
  elevenlabs_voice_name text,
  voice_style text,
  voice_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Books in a series
create table books (
  id uuid primary key default gen_random_uuid(),
  series_id uuid references series(id) on delete cascade,
  title text not null,
  manuscript_path text,
  status text check (status in (
    'uploaded', 'analyzing', 'needs_casting', 'ready_for_review',
    'reviewing', 'ready_for_export', 'exported'
  )) default 'uploaded',
  uploaded_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tagged lines from manuscript processing
create table tagged_lines (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references books(id) on delete cascade,
  line_order int not null,
  paragraph_num int not null,
  speaker_character_id uuid references characters(id),
  speaker_label text not null,
  line_text text not null,
  confidence text check (confidence in ('high', 'medium', 'low', 'none')),
  flag_reason text,
  ai_reviewed boolean default false,
  human_reviewed boolean default false,
  created_at timestamptz default now()
);

create index tagged_lines_book_id_line_order_idx on tagged_lines (book_id, line_order);

-- Character appearances per book
create table book_characters (
  book_id uuid references books(id) on delete cascade,
  character_id uuid references characters(id) on delete cascade,
  line_count int default 0,
  primary key (book_id, character_id)
);

-- Audit log for character casting changes
create table casting_history (
  id uuid primary key default gen_random_uuid(),
  character_id uuid references characters(id) on delete cascade,
  changed_by uuid references auth.users(id),
  old_voice_id text,
  new_voice_id text,
  old_voice_name text,
  new_voice_name text,
  changed_at timestamptz default now()
);

-- Keep updated_at in sync on characters and books
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger characters_updated_at
  before update on characters
  for each row execute function set_updated_at();

create trigger books_updated_at
  before update on books
  for each row execute function set_updated_at();
