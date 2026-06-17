-- Team shared workspace: every authenticated user can read/write all production data.
-- Safe to re-run after a paused/restored Supabase project (idempotent).

do $$
declare
  t text;
begin
  foreach t in array array[
    'pen_names',
    'series',
    'characters',
    'books',
    'tagged_lines',
    'book_characters',
    'casting_history',
    'pronunciations',
    'book_chapters',
    'book_manuscript_snapshots',
    'ai_review_snapshots'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table %I enable row level security', t);

      if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = t
          and policyname = 'Authenticated full access'
      ) then
        execute format(
          'create policy "Authenticated full access" on %I for all to authenticated using (true) with check (true)',
          t
        );
      end if;
    end if;
  end loop;
end $$;
