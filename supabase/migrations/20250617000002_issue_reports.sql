-- In-app issue reports from teammates (screenshot + context for admin triage).
create table if not exists issue_reports (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'open' check (status in ('open', 'resolved')),
  description text not null,
  page_url text not null,
  page_label text,
  context_json jsonb not null default '{}',
  screenshot_path text,
  reported_by uuid not null,
  reporter_email text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists issue_reports_status_created_idx
  on issue_reports (status, created_at desc);

alter table issue_reports enable row level security;

drop policy if exists "Authenticated insert own reports" on issue_reports;
create policy "Authenticated insert own reports"
  on issue_reports for insert to authenticated
  with check (reported_by = auth.uid());

drop policy if exists "Authenticated read own reports" on issue_reports;
create policy "Authenticated read own reports"
  on issue_reports for select to authenticated
  using (reported_by = auth.uid());

insert into storage.buckets (id, name, public)
values ('issue-reports', 'issue-reports', false)
on conflict (id) do nothing;

drop policy if exists "Authenticated upload issue reports" on storage.objects;
create policy "Authenticated upload issue reports"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'issue-reports');

drop policy if exists "Authenticated read issue reports" on storage.objects;
create policy "Authenticated read issue reports"
  on storage.objects for select to authenticated
  using (bucket_id = 'issue-reports');
