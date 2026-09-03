-- Additive v2 shape. No existing WorkDraft, WorkSession, WorkVersion, or
-- VisualAsset is deleted, reset, or mapped to a new task code.
create table if not exists public.farms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  is_legacy_seed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.demo_owners (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  pin_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists demo_owners_active_farm_idx on public.demo_owners (farm_id) where is_active;

-- Deployment supplies p_pin from its secret store. No PIN literal is kept in
-- this migration and the application only receives the active owner/farm pair.
create function public.seed_demo_owner(p_farm_slug text, p_pin text)
returns table(owner_id uuid, farm_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_farm_id uuid;
  target_owner_id uuid;
begin
  if nullif(p_pin, '') is null then raise exception 'invalid_demo_owner_pin'; end if;
  select id into target_farm_id from public.farms where slug = p_farm_slug for update;
  if not found then raise exception 'farm_not_found'; end if;
  select id into target_owner_id from public.demo_owners where farm_id = target_farm_id and is_active for update;
  if found then
    update public.demo_owners set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 12)) where id = target_owner_id;
  else
    insert into public.demo_owners(farm_id, pin_hash) values (target_farm_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 12))) returning id into target_owner_id;
  end if;
  return query select target_owner_id, target_farm_id;
end;
$$;

create function public.authenticate_demo_owner(p_pin text)
returns table(owner_id uuid, farm_id uuid)
language sql
security definer
set search_path = public, pg_temp
as $$
  select id, farm_id
  from public.demo_owners
  where is_active and p_pin is not null and extensions.crypt(p_pin, pin_hash) = pin_hash
  order by created_at
  limit 1;
$$;

insert into public.farms (slug, display_name, is_legacy_seed)
values ('legacy-v1', 'Legacy v1 farm', true)
on conflict (slug) do nothing;

alter table public.work_drafts add column if not exists farm_id uuid references public.farms(id);
alter table public.work_drafts add column if not exists ontology_version text;
alter table public.work_sessions add column if not exists farm_id uuid references public.farms(id);
alter table public.work_sessions add column if not exists contract_version text;
alter table public.work_sessions add column if not exists ontology_version text;
alter table public.work_versions add column if not exists contract_version text;
alter table public.work_versions add column if not exists ontology_version text;
alter table public.worker_links add column if not exists farm_id uuid references public.farms(id);
alter table public.today_work_teams add column if not exists farm_id uuid references public.farms(id);
alter table public.today_work_team_members add column if not exists farm_id uuid references public.farms(id);
alter table public.today_work_assignments add column if not exists farm_id uuid references public.farms(id);

-- Explicitly classify existing records under their historical v1 contract.
update public.work_drafts set farm_id = (select id from public.farms where slug = 'legacy-v1') where farm_id is null;
update public.work_drafts set contract_version = 'structure-v1' where contract_version is null;
update public.work_drafts set ontology_version = 'ontology-v1' where ontology_version is null;
update public.work_sessions set farm_id = (select id from public.farms where slug = 'legacy-v1') where farm_id is null;
update public.work_sessions set contract_version = 'structure-v1' where contract_version is null;
update public.work_sessions set ontology_version = 'ontology-v1' where ontology_version is null;
update public.work_versions set contract_version = 'structure-v1' where contract_version is null;
update public.work_versions set ontology_version = 'ontology-v1' where ontology_version is null;
update public.worker_links set farm_id = (select id from public.farms where slug = 'legacy-v1') where farm_id is null;
update public.today_work_teams set farm_id = (select id from public.farms where slug = 'legacy-v1') where farm_id is null;
update public.today_work_team_members as member
set farm_id = team.farm_id
from public.today_work_teams as team
where member.team_id = team.id and member.farm_id is null;
update public.today_work_assignments as assignment
set farm_id = member.farm_id
from public.today_work_team_members as member
where assignment.team_member_id = member.id and assignment.farm_id is null;

alter table public.work_drafts alter column farm_id set not null;
alter table public.work_sessions alter column farm_id set not null;
alter table public.worker_links alter column farm_id set not null;
alter table public.today_work_teams alter column farm_id set not null;
alter table public.today_work_team_members alter column farm_id set not null;
alter table public.today_work_assignments alter column farm_id set not null;

alter table public.work_drafts add constraint work_drafts_contract_version_check
  check ((contract_version = 'structure-v1' and ontology_version = 'ontology-v1') or (contract_version = 'structure-v2' and ontology_version = 'ontology-v2')) not valid;
alter table public.work_sessions add constraint work_sessions_contract_version_check
  check ((contract_version = 'structure-v1' and ontology_version = 'ontology-v1') or (contract_version = 'structure-v2' and ontology_version = 'ontology-v2')) not valid;
alter table public.work_versions add constraint work_versions_contract_version_check
  check ((contract_version = 'structure-v1' and ontology_version = 'ontology-v1') or (contract_version = 'structure-v2' and ontology_version = 'ontology-v2')) not valid;
alter table public.work_drafts validate constraint work_drafts_contract_version_check;
alter table public.work_sessions validate constraint work_sessions_contract_version_check;
alter table public.work_versions validate constraint work_versions_contract_version_check;

create index if not exists work_drafts_farm_idx on public.work_drafts (farm_id, updated_at desc);
create index if not exists work_sessions_farm_idx on public.work_sessions (farm_id, updated_at desc);
create index if not exists worker_links_farm_idx on public.worker_links (farm_id, work_session_id);

alter table public.today_work_teams drop constraint if exists today_work_teams_work_date_key;
alter table public.today_work_teams add constraint today_work_teams_farm_work_date_key unique (farm_id, work_date);
alter table public.work_sessions add constraint work_sessions_id_farm_key unique (id, farm_id);
alter table public.today_work_teams add constraint today_work_teams_id_farm_key unique (id, farm_id);
alter table public.today_work_team_members add constraint today_work_team_members_id_farm_key unique (id, farm_id);
alter table public.worker_links add constraint worker_links_session_farm_fkey
  foreign key (work_session_id, farm_id) references public.work_sessions (id, farm_id);
alter table public.today_work_team_members add constraint today_members_team_farm_fkey
  foreign key (team_id, farm_id) references public.today_work_teams (id, farm_id);
alter table public.today_work_assignments add constraint today_assignments_member_farm_fkey
  foreign key (team_member_id, farm_id) references public.today_work_team_members (id, farm_id);
alter table public.today_work_assignments add constraint today_assignments_session_farm_fkey
  foreign key (work_session_id, farm_id) references public.work_sessions (id, farm_id);

create table if not exists public.worker_briefing_packages (
  id uuid primary key default gen_random_uuid(),
  work_version_id uuid not null references public.work_versions(id) on delete cascade,
  language_code text not null check (language_code in ('vi', 'ne')),
  contract_version text not null check (contract_version = 'worker-briefing-v2'),
  ontology_version text not null check (ontology_version = 'ontology-v2'),
  package_json jsonb not null,
  created_at timestamptz not null default now(),
  unique (work_version_id, language_code)
);
create index if not exists worker_briefing_packages_version_idx on public.worker_briefing_packages (work_version_id, language_code);
alter table public.worker_briefing_packages enable row level security;
revoke all on public.farms, public.demo_owners, public.worker_briefing_packages from anon, authenticated;
grant all privileges on table public.farms, public.demo_owners, public.worker_briefing_packages to service_role;
revoke all on function public.seed_demo_owner(text, text) from public, anon, authenticated;
revoke all on function public.authenticate_demo_owner(text) from public, anon, authenticated;
grant execute on function public.seed_demo_owner(text, text) to service_role;
grant execute on function public.authenticate_demo_owner(text) to service_role;

-- One atomic v2 publish path for an initial draft or a regeneration. p_session_id
-- is supplied by BE for initial publish so both prebuilt packages carry it.
alter table public.work_drafts add column if not exists confirmed_session_id uuid references public.work_sessions(id);

create function public.publish_work_version_with_packages(
  p_farm_id uuid,
  p_draft_id uuid,
  p_session_id uuid,
  p_expected_version integer,
  p_state_json jsonb,
  p_packages jsonb,
  p_decision text default 'CONFIRM',
  p_ambiguity_override boolean default false,
  p_override_reason text default null
) returns table(session_id uuid, version integer)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  session_row public.work_sessions%rowtype;
  draft_row public.work_drafts%rowtype;
  new_version_id uuid;
  next_version integer;
begin
  if jsonb_typeof(p_packages) <> 'array' or jsonb_array_length(p_packages) <> 2
     or (select count(distinct value->>'language_code') from jsonb_array_elements(p_packages)) <> 2
     or exists (select 1 from jsonb_array_elements(p_packages) where not (value ?& array['session_id', 'version', 'contract_version', 'ontology_version', 'language_code', 'context', 'badges', 'steps', 'source_detail', 'tts', 'video']) or value->>'language_code' not in ('vi', 'ne') or value->>'contract_version' <> 'worker-briefing-v2' or value->>'ontology_version' <> 'ontology-v2') then
    raise exception 'invalid_worker_briefing_packages';
  end if;
  if jsonb_typeof(p_state_json) <> 'object'
     or not (p_state_json ?& array['interpretation', 'summary_ko', 'location', 'task_family', 'quantity', 'deadline', 'safety', 'notes', 'steps', 'ambiguities', 'schema_version', 'contract_version', 'ontology_version'])
     or p_state_json->>'contract_version' <> 'structure-v2' or p_state_json->>'ontology_version' <> 'ontology-v2' then
    raise exception 'invalid_state';
  end if;

  if p_draft_id is not null then
    if p_expected_version <> 0 or p_session_id is null then raise exception 'invalid_initial_publish'; end if;
    select * into draft_row from public.work_drafts where id = p_draft_id and farm_id = p_farm_id for update;
    if not found or draft_row.confirmed_session_id is not null then return; end if;
    if draft_row.contract_version <> 'structure-v2' or draft_row.ontology_version <> 'ontology-v2' then raise exception 'legacy_read_only'; end if;
    insert into public.work_sessions(id, farm_id, location, task_family, status, current_version, contract_version, ontology_version)
    values (p_session_id, p_farm_id, coalesce(p_state_json->'location', '{}'::jsonb), p_state_json->>'task_family', 'PUBLISHED', 1, 'structure-v2', 'ontology-v2');
    next_version := 1;
  else
    select * into session_row from public.work_sessions where id = p_session_id and farm_id = p_farm_id for update;
    if not found then return; end if;
    if session_row.contract_version <> 'structure-v2' or session_row.ontology_version <> 'ontology-v2' then raise exception 'legacy_read_only'; end if;
    if session_row.status <> 'PUBLISHED' or session_row.current_version <> p_expected_version then return; end if;
    next_version := p_expected_version + 1;
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_packages)
    where value->>'session_id' <> p_session_id::text
       or value->>'version' <> next_version::text
  ) then
    raise exception 'invalid_worker_briefing_packages';
  end if;

  -- Insert package-bearing version first as SUPERSEDED: the old partial unique
  -- PUBLISHED index stays valid until both immutable packages are stored.
  insert into public.work_versions(work_session_id, version, status, state_json, transcript, confirmation_decision, ambiguity_override, override_reason, contract_version, ontology_version)
  values (p_session_id, next_version, case when next_version = 1 then 'PUBLISHED' else 'SUPERSEDED' end, p_state_json, null, p_decision, p_ambiguity_override, p_override_reason, 'structure-v2', 'ontology-v2')
  returning id into new_version_id;
  insert into public.worker_briefing_packages(work_version_id, language_code, contract_version, ontology_version, package_json)
  select new_version_id, value->>'language_code', 'worker-briefing-v2', 'ontology-v2', value
  from jsonb_array_elements(p_packages);

  if next_version > 1 then
    update public.work_versions set status = 'SUPERSEDED' where work_session_id = p_session_id and version = p_expected_version and status = 'PUBLISHED';
    update public.work_versions set status = 'PUBLISHED' where id = new_version_id;
    update public.work_sessions set current_version = next_version, updated_at = now() where id = p_session_id and farm_id = p_farm_id;
  else
    update public.work_drafts set confirmed_session_id = p_session_id where id = p_draft_id and farm_id = p_farm_id;
  end if;
  return query select p_session_id, next_version;
end;
$$;

revoke all on function public.publish_work_version_with_packages(uuid, uuid, uuid, integer, jsonb, jsonb, text, boolean, text) from public, anon, authenticated;
grant execute on function public.publish_work_version_with_packages(uuid, uuid, uuid, integer, jsonb, jsonb, text, boolean, text) to service_role;
-- This prior v2-shaped RPC cannot store both briefing packages. It remains in
-- migration history but is deliberately not callable after the v2 cutover.
revoke all on function public.publish_quantity_change(uuid, uuid, integer, jsonb, jsonb) from public, anon, authenticated;

-- v1 issue_worker_link remains a legacy read path. New remote links are
-- farm-scoped and can only point at a package-bearing v2 published version.
create function public.issue_worker_link_v2(
  p_farm_id uuid,
  p_session_id uuid,
  p_language_code text,
  p_link jsonb
) returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  session_row public.work_sessions%rowtype;
begin
  if p_language_code not in ('vi', 'ne') then raise exception 'invalid_language'; end if;
  if jsonb_typeof(p_link) <> 'object'
     or nullif(p_link->>'token_hash', '') is null
     or nullif(p_link->>'issue_idempotency_key', '') is null
     or nullif(p_link->>'issued_at', '') is null
     or nullif(p_link->>'expires_at', '') is null then
    raise exception 'invalid_worker_link';
  end if;
  select * into session_row from public.work_sessions
  where id = p_session_id and farm_id = p_farm_id for update;
  if not found then return; end if;
  if session_row.contract_version <> 'structure-v2' or session_row.ontology_version <> 'ontology-v2' then
    raise exception 'legacy_read_only';
  end if;
  if session_row.status <> 'PUBLISHED' or not exists (
    select 1 from public.work_versions as version
    join public.worker_briefing_packages as package on package.work_version_id = version.id
    where version.work_session_id = p_session_id and version.version = session_row.current_version
      and version.status = 'PUBLISHED' and package.language_code = p_language_code
  ) then
    raise exception 'worker_briefing_package_not_found';
  end if;
  update public.worker_links set revoked_at = now()
  where farm_id = p_farm_id and work_session_id = p_session_id
    and language_code = p_language_code and revoked_at is null;
  insert into public.worker_links(farm_id, work_session_id, language_code, token_hash, issued_at, expires_at, issue_idempotency_key)
  values (p_farm_id, p_session_id, p_language_code, p_link->>'token_hash',
    (p_link->>'issued_at')::timestamptz, (p_link->>'expires_at')::timestamptz,
    p_link->>'issue_idempotency_key');
end;
$$;

revoke all on function public.issue_worker_link_v2(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.issue_worker_link_v2(uuid, uuid, text, jsonb) to service_role;
