-- Users allowed to add/remove team members (granted by super admins in ADMIN_EMAILS).

create table team_manager_grants (
  user_id uuid primary key,
  email text not null unique,
  created_at timestamptz not null default now(),
  granted_by uuid
);

alter table team_manager_grants enable row level security;

-- All access via service role in API routes; no client policies.
