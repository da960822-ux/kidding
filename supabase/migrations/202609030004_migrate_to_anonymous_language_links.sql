do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'worker_links' and column_name = 'worker_id'
  ) then
    drop table public.worker_links;
  end if;
  if to_regclass('public.workers') is not null then
    alter table if exists public.today_assignments
      drop constraint if exists today_assignments_worker_id_fkey;
    drop table public.workers;
  end if;
end
$$;

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

-- Replace functions from an already-applied worker-registry migration.
drop function if exists public.publish_initial_draft(uuid, jsonb, text, text, text, boolean, jsonb);
drop function if exists public.issue_worker_links(uuid, uuid[], jsonb);
drop function if exists public.issue_worker_link(uuid, text, jsonb);

create or replace function public.publish_initial_draft(
  p_draft_id uuid,
  p_state_json jsonb,
  p_transcript text,
  p_decision text,
  p_override_reason text,
  p_ambiguity_override boolean,
  p_delivery_mode text,
  p_language_code text,
  p_link jsonb
) returns table(session_id uuid)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  new_session_id uuid;
begin
  if p_delivery_mode not in ('CO_PRESENT', 'REMOTE') or p_language_code not in ('vi', 'ne') then
    raise exception 'invalid_delivery';
  end if;
  if p_delivery_mode = 'REMOTE' and p_link is null then
    raise exception 'remote_link_required';
  end if;
  if not exists (select 1 from public.work_drafts where id = p_draft_id) then
    raise exception 'draft_not_found';
  end if;
  insert into public.work_sessions(location, task_family, status, current_version)
  values (coalesce(p_state_json->'location', '{}'::jsonb), 'ONION', 'PUBLISHED', 1)
  returning id into new_session_id;
  insert into public.work_versions(work_session_id, version, status, state_json, transcript, confirmation_decision, ambiguity_override, override_reason, overridden_at)
  values (new_session_id, 1, 'PUBLISHED', p_state_json, p_transcript, p_decision, p_ambiguity_override, p_override_reason, case when p_ambiguity_override then now() else null end);
  if p_delivery_mode = 'REMOTE' then
    insert into public.worker_links(work_session_id, language_code, token_hash, issued_at, expires_at, issue_idempotency_key)
    values (new_session_id, p_language_code, p_link->>'token_hash', (p_link->>'issued_at')::timestamptz, (p_link->>'expires_at')::timestamptz, p_link->>'issue_idempotency_key');
  end if;
  delete from public.work_drafts where id = p_draft_id;
  return query select new_session_id;
end;
$$;

create or replace function public.issue_worker_link(
  p_session_id uuid,
  p_language_code text,
  p_link jsonb
) returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if p_language_code not in ('vi', 'ne') then raise exception 'invalid_language'; end if;
  if not exists (select 1 from public.work_sessions where id = p_session_id and status = 'PUBLISHED') then raise exception 'session_not_found'; end if;
  update public.worker_links set revoked_at = now() where work_session_id = p_session_id and language_code = p_language_code and revoked_at is null;
  insert into public.worker_links(work_session_id, language_code, token_hash, issued_at, expires_at, issue_idempotency_key)
  values (p_session_id, p_language_code, p_link->>'token_hash', (p_link->>'issued_at')::timestamptz, (p_link->>'expires_at')::timestamptz, p_link->>'issue_idempotency_key');
end;
$$;

revoke all on function public.publish_initial_draft(uuid, jsonb, text, text, text, boolean, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.issue_worker_link(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.publish_initial_draft(uuid, jsonb, text, text, text, boolean, text, text, jsonb) to service_role;
grant execute on function public.issue_worker_link(uuid, text, jsonb) to service_role;

-- The backend uses the server-only service_role key through PostgREST.
grant all privileges on table
  public.work_sessions,
  public.work_drafts,
  public.work_versions,
  public.worker_links,
  public.guide_phrases,
  public.guide_translations,
  public.visual_assets
to service_role;
