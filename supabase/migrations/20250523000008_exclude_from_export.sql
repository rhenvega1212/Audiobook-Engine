-- Allow marking lines (e.g. recipes) as omitted from audiobook export
alter table tagged_lines
  add column if not exists excluded_from_export boolean not null default false;

create index if not exists tagged_lines_book_excluded_idx
  on tagged_lines (book_id, excluded_from_export)
  where excluded_from_export = true;
