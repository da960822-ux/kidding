create table public.today_work_teams (
  id uuid primary key default gen_random_uuid(),
  work_date date not null unique,
  invite_token_hash text not null unique,
  invite_issue_idempotency_key text not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (expires_at > issued_at)
);

create table public.today_work_team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.today_work_teams(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 30),
  language_code text not null check (language_code in ('vi', 'ne')),
  joined_at timestamptz not null default now(),
  join_idempotency_key text not null,
  unique (team_id, join_idempotency_key)
);
create index today_work_team_members_team_joined_idx
  on public.today_work_team_members (team_id, joined_at);

create table public.today_work_assignments (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.today_work_team_members(id) on delete cascade,
  work_session_id uuid not null references public.work_sessions(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index today_work_assignments_one_active_idx
  on public.today_work_assignments (team_member_id, work_session_id) where revoked_at is null;
create index today_work_assignments_member_active_idx
  on public.today_work_assignments (team_member_id, assigned_at) where revoked_at is null;

alter table public.today_work_teams enable row level security;
alter table public.today_work_team_members enable row level security;
alter table public.today_work_assignments enable row level security;
revoke all on public.today_work_teams, public.today_work_team_members, public.today_work_assignments from anon, authenticated;
grant all privileges on table public.today_work_teams, public.today_work_team_members, public.today_work_assignments to service_role;
