-- `farms.slug` is the stable owner-facing farm code. Provisioning creates the
-- farm and rotates its single active credential without storing the raw PIN.
drop index if exists public.demo_owners_active_farm_idx;
do $$
begin
  if exists (
    select 1
    from public.demo_owners
    where is_active
    group by farm_id
    having count(*) > 1
  ) then
    raise exception 'active_demo_owner_duplicate: resolve duplicate active credentials before migration';
  end if;
end;
$$;
create unique index if not exists demo_owners_one_active_credential_per_farm_idx
  on public.demo_owners (farm_id)
  where is_active;

create function public.provision_farm_owner(
  p_farm_code text,
  p_display_name text,
  p_pin text
) returns table(owner_id uuid, farm_id uuid, farm_code text, farm_name text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_farm_code text := lower(btrim(p_farm_code));
  normalized_display_name text := btrim(p_display_name);
  target_farm_id uuid;
  target_owner_id uuid;
begin
  if normalized_farm_code is null
     or normalized_farm_code !~ '^[a-z0-9][a-z0-9-]{2,31}$' then
    raise exception 'invalid_farm_code';
  end if;
  if normalized_display_name is null
     or char_length(normalized_display_name) not between 1 and 80 then
    raise exception 'invalid_farm_display_name';
  end if;
  if p_pin is null or char_length(p_pin) not between 4 and 32 then
    raise exception 'invalid_farm_owner_pin';
  end if;

  insert into public.farms (slug, display_name, is_legacy_seed)
  values (normalized_farm_code, normalized_display_name, false)
  on conflict (slug) do update
    set display_name = excluded.display_name
    where not farms.is_legacy_seed
  returning id into target_farm_id;

  if target_farm_id is null then
    raise exception 'reserved_farm_code';
  end if;

  insert into public.demo_owners (farm_id, pin_hash, is_active)
  values (target_farm_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 12)), true)
  on conflict (farm_id) where is_active do update
    set pin_hash = excluded.pin_hash
  returning id into target_owner_id;

  return query
  select target_owner_id, target_farm_id, normalized_farm_code, normalized_display_name;
end;
$$;

create function public.authenticate_farm_owner(p_farm_code text, p_pin text)
returns table(owner_id uuid, farm_id uuid, farm_code text, farm_name text)
language sql
security definer
set search_path = public, pg_temp
as $$
  select owner.id, farm.id, farm.slug, farm.display_name
  from public.farms as farm
  join public.demo_owners as owner on owner.farm_id = farm.id
  where farm.slug = lower(btrim(p_farm_code))
    and not farm.is_legacy_seed
    and owner.is_active
    and p_pin is not null
    and extensions.crypt(p_pin, owner.pin_hash) = owner.pin_hash;
$$;

-- Expand phase: keep the old PIN-only authentication callable until the
-- application deployment and farm provisioning have switched to these RPCs.
-- The following contract migration removes the old authentication/write RPCs.
revoke all on function public.provision_farm_owner(text, text, text) from public, anon, authenticated;
revoke all on function public.authenticate_farm_owner(text, text) from public, anon, authenticated;
grant execute on function public.provision_farm_owner(text, text, text) to service_role;
grant execute on function public.authenticate_farm_owner(text, text) to service_role;

-- Serialize QR rotation at its team row. A replayed older key returns the
-- currently active invite, never writes its already-revoked token back.
create table if not exists public.today_work_team_invite_rotations (
  team_id uuid not null references public.today_work_teams(id) on delete cascade,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  primary key (team_id, idempotency_key)
);
alter table public.today_work_team_invite_rotations enable row level security;

create function public.rotate_today_work_team_invite(
  p_farm_id uuid,
  p_work_date date,
  p_idempotency_key text,
  p_invite_token_hash text,
  p_issued_at timestamptz,
  p_expires_at timestamptz
) returns setof public.today_work_teams
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_team public.today_work_teams%rowtype;
begin
  select * into target_team
  from public.today_work_teams
  where farm_id = p_farm_id and work_date = p_work_date
  for update;
  if not found then
    raise exception 'today_work_team_not_found';
  end if;

  insert into public.today_work_team_invite_rotations (team_id, idempotency_key)
  values (target_team.id, target_team.invite_issue_idempotency_key)
  on conflict do nothing;

  if exists (
    select 1 from public.today_work_team_invite_rotations
    where team_id = target_team.id and idempotency_key = p_idempotency_key
  ) then
    return next target_team;
    return;
  end if;

  update public.today_work_teams
  set invite_token_hash = p_invite_token_hash,
      invite_issue_idempotency_key = p_idempotency_key,
      issued_at = p_issued_at,
      expires_at = p_expires_at
  where id = target_team.id
  returning * into target_team;
  insert into public.today_work_team_invite_rotations (team_id, idempotency_key)
  values (target_team.id, p_idempotency_key);
  return next target_team;
end;
$$;

create function public.p0_readiness()
returns table(ready boolean)
language sql
security definer
set search_path = public, pg_temp
as $$
  select to_regprocedure('public.authenticate_farm_owner(text,text)') is not null
     and to_regprocedure('public.provision_farm_owner(text,text,text)') is not null
     and to_regprocedure('public.rotate_today_work_team_invite(uuid,date,text,text,timestamp with time zone,timestamp with time zone)') is not null
     and to_regclass('public.today_work_team_invite_rotations') is not null
     and to_regclass('public.demo_owners_one_active_credential_per_farm_idx') is not null;
$$;

revoke all on table public.today_work_team_invite_rotations from public, anon, authenticated, service_role;
revoke all on function public.rotate_today_work_team_invite(uuid, date, text, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.p0_readiness() from public, anon, authenticated;
grant execute on function public.rotate_today_work_team_invite(uuid, date, text, text, timestamptz, timestamptz) to service_role;
grant execute on function public.p0_readiness() to service_role;
