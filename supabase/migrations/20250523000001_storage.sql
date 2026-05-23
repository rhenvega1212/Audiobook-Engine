-- Storage buckets for manuscripts and exports
insert into storage.buckets (id, name, public)
values
  ('manuscripts', 'manuscripts', false),
  ('exports', 'exports', false)
on conflict (id) do nothing;

create policy "Authenticated read manuscripts"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'manuscripts');

create policy "Authenticated write manuscripts"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'manuscripts');

create policy "Authenticated update manuscripts"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'manuscripts');

create policy "Authenticated delete manuscripts"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'manuscripts');

create policy "Authenticated read exports"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'exports');

create policy "Authenticated write exports"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'exports');
