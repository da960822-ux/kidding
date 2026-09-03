-- Historical migration kept non-destructive. Existing worker-registry rows and
-- functions remain readable; later application contracts stop creating them.
create table if not exists public.worker_links (
  id uuid primary key default gen_random_uuid(),
  work_session_id uuid not null references public.work_sessions(id) on delete cascade,
  language_code text not null check (language_code in ('vi', 'ne')),
  token_hash text not null unique,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  issue_idempotency_key text not null
);

create unique index if not exists worker_links_one_active_language_idx
  on public.worker_links (work_session_id, language_code) where revoked_at is null;
create index if not exists worker_links_session_idx on public.worker_links (work_session_id);
alter table public.worker_links enable row level security;
revoke all on public.worker_links from anon, authenticated;
