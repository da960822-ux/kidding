create extension if not exists pgcrypto;

create table if not exists public.work_sessions (
  id uuid primary key default gen_random_uuid(),
  location jsonb not null,
  task_family text not null default 'ONION' check (task_family = 'ONION'),
  status text not null default 'PUBLISHED' check (status = 'PUBLISHED'),
  current_version integer not null default 1 check (current_version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_drafts (
  id uuid primary key default gen_random_uuid(),
  draft_revision integer not null default 0 check (draft_revision >= 0),
  summary_ko text not null,
  transcript text not null,
  interpretation text not null check (interpretation in ('READY', 'AMBIGUOUS', 'UNSUPPORTED')),
  state_json jsonb not null,
  ambiguities jsonb not null default '[]'::jsonb,
  contract_version text not null default 'structure-v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create table if not exists public.work_versions (
  id uuid primary key default gen_random_uuid(),
  work_session_id uuid not null references public.work_sessions(id) on delete cascade,
  version integer not null check (version >= 1),
  status text not null check (status in ('PUBLISHED', 'SUPERSEDED')),
  state_json jsonb not null,
  transcript text,
  confirmed_at timestamptz not null default now(),
  confirmation_decision text not null check (confirmation_decision in ('CONFIRM', 'PUBLISH_AS_IS')),
  ambiguity_override boolean not null default false,
  override_reason text check (override_reason is null or override_reason in ('EXPERIENCED_WORKER', 'IN_PERSON_BRIEFING', 'OWNER_ACCEPTED_OTHER')),
  overridden_at timestamptz,
  created_at timestamptz not null default now(),
  unique (work_session_id, version)
);

create unique index if not exists work_versions_one_published_idx
  on public.work_versions (work_session_id) where status = 'PUBLISHED';
create index if not exists work_versions_session_status_idx
  on public.work_versions (work_session_id, status, version desc);

alter table public.work_sessions enable row level security;
alter table public.work_drafts enable row level security;
alter table public.work_versions enable row level security;
