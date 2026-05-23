-- Row Level Security: authenticated team members have full read/write on all tables.
-- Not multi-tenant — every invited user sees everything.

alter table pen_names enable row level security;
alter table series enable row level security;
alter table characters enable row level security;
alter table books enable row level security;
alter table tagged_lines enable row level security;
alter table book_characters enable row level security;
alter table casting_history enable row level security;

create policy "Authenticated full access"
  on pen_names for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated full access"
  on series for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated full access"
  on characters for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated full access"
  on books for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated full access"
  on tagged_lines for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated full access"
  on book_characters for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated full access"
  on casting_history for all
  to authenticated
  using (true)
  with check (true);
