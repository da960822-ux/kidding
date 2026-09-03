-- Additive: keep existing farms, credentials, teams and immutable work versions.
alter table public.today_work_teams
  add column owner_id uuid references public.demo_owners(id),
  add column owner_pin_hash text,
  add column bootstrap_key_hash text unique,
  add column activated_at timestamptz,
  add constraint temporary_team_credentials_complete check (
    (owner_id is null and owner_pin_hash is null and bootstrap_key_hash is null and activated_at is null)
    or (owner_id is not null and owner_pin_hash is not null and bootstrap_key_hash is not null)
  );
create unique index temporary_team_one_private_farm_idx on public.today_work_teams(farm_id) where owner_id is not null;

alter table public.today_work_assignments
  add column acknowledged_version integer check (acknowledged_version > 0),
  add column acknowledged_at timestamptz,
  add constraint assignment_acknowledgement_complete check ((acknowledged_version is null) = (acknowledged_at is null));

create function public.start_temporary_work_team(
  p_team_id uuid, p_owner_id uuid, p_farm_id uuid, p_bootstrap_key_hash text,
  p_pin text, p_invite_token_hash text, p_invite_issue_key text
) returns setof public.today_work_teams
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target public.today_work_teams%rowtype;
  started timestamptz := clock_timestamp();
begin
  if p_team_id is null or p_owner_id is null or p_farm_id is null
     or p_bootstrap_key_hash is null or p_bootstrap_key_hash !~ '^[0-9a-f]{64}$'
     or p_pin is null or p_pin !~ '^[0-9]{6}$'
     or p_invite_token_hash is null or p_invite_token_hash !~ '^[0-9a-f]{64}$'
     or length(coalesce(p_invite_issue_key,'')) < 8 then raise exception 'invalid_team_start'; end if;
  -- Serialize only equal retry keys; unrelated new teams do not block one another.
  perform pg_advisory_xact_lock(hashtextextended(p_bootstrap_key_hash, 0));
  select * into target from public.today_work_teams where bootstrap_key_hash=p_bootstrap_key_hash;
  if found then
    if target.expires_at <= clock_timestamp() then raise exception 'expired_team'; end if;
    return next target; return;
  end if;
  insert into public.farms(id,slug,display_name,is_legacy_seed)
  values(p_farm_id,'temporary-'||p_farm_id::text,'임시 작업팀',false);
  -- No temporary team can bypass its expiry using the legacy farm/PIN login.
  insert into public.demo_owners(id,farm_id,pin_hash,is_active)
  values(p_owner_id,p_farm_id,extensions.crypt(encode(extensions.gen_random_bytes(32),'hex'),extensions.gen_salt('bf',12)),false);
  insert into public.today_work_teams(id,farm_id,owner_id,owner_pin_hash,bootstrap_key_hash,work_date,
    invite_token_hash,invite_issue_idempotency_key,created_at,issued_at,expires_at)
  values(p_team_id,p_farm_id,p_owner_id,extensions.crypt(p_pin,extensions.gen_salt('bf',12)),p_bootstrap_key_hash,
    (started at time zone 'Asia/Seoul')::date,p_invite_token_hash,p_invite_issue_key,started,started,started+interval '1 hour')
  returning * into target;
  return next target;
end;
$$;

create function public.authenticate_temporary_team(p_team_id uuid,p_pin text)
returns setof public.today_work_teams
language sql security definer set search_path = public, pg_temp as $$
  select t.* from public.today_work_teams t
  where t.id=p_team_id and t.owner_id is not null and t.activated_at is not null
    and t.expires_at > clock_timestamp() and p_pin ~ '^[0-9]{6}$'
    and extensions.crypt(p_pin,t.owner_pin_hash)=t.owner_pin_hash;
$$;

create function public.guard_temporary_team_lifetime() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if old.owner_id is not null then
    if new.owner_id is distinct from old.owner_id or new.farm_id is distinct from old.farm_id
       or new.owner_pin_hash is distinct from old.owner_pin_hash
       or new.bootstrap_key_hash is distinct from old.bootstrap_key_hash
       or new.created_at is distinct from old.created_at then raise exception 'fixed_team_identity'; end if;
    if old.activated_at is not null and (new.activated_at is distinct from old.activated_at
       or new.expires_at is distinct from old.expires_at or new.issued_at is distinct from old.issued_at)
       then raise exception 'fixed_team_lifetime'; end if;
  end if;
  return new;
end;
$$;
create trigger temporary_team_fixed_lifetime before update on public.today_work_teams
for each row execute function public.guard_temporary_team_lifetime();

create function public.activate_temporary_team_on_publish() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  target public.today_work_teams%rowtype;
  activated timestamptz;
begin
  select * into target from public.today_work_teams where farm_id=new.farm_id and owner_id is not null for update;
  if not found then return new; end if;
  activated := clock_timestamp();
  if target.expires_at <= activated then raise exception 'expired_team'; end if;
  if target.activated_at is null then
    if tg_op <> 'INSERT' then raise exception 'team_not_active'; end if;
    update public.today_work_teams set activated_at=activated,issued_at=activated,expires_at=activated+interval '24 hours'
    where id=target.id;
  end if;
  return new;
end;
$$;
create trigger temporary_team_publish before insert or update on public.work_sessions
for each row execute function public.activate_temporary_team_on_publish();

create function public.guard_temporary_team_write() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare target public.today_work_teams%rowtype;
begin
  select * into target from public.today_work_teams where farm_id=new.farm_id and owner_id is not null;
  if found then
    if target.expires_at <= clock_timestamp() then raise exception 'expired_team'; end if;
    if tg_table_name <> 'work_drafts' and target.activated_at is null then raise exception 'team_not_active'; end if;
  end if;
  return new;
end;
$$;
create trigger temporary_team_draft_write before insert or update on public.work_drafts
for each row execute function public.guard_temporary_team_write();
create trigger temporary_team_member_write before insert or update on public.today_work_team_members
for each row execute function public.guard_temporary_team_write();
create trigger temporary_team_assignment_write before insert or update on public.today_work_assignments
for each row execute function public.guard_temporary_team_write();

create function public.acknowledge_team_assignment(p_team_id uuid,p_member_id uuid,p_session_id uuid,p_expected_version integer)
returns table(work_session_id uuid,current_version integer,acknowledged_version integer,acknowledged_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target_team public.today_work_teams%rowtype;
  target_session public.work_sessions%rowtype;
  target_assignment public.today_work_assignments%rowtype;
begin
  -- Session then team: same order as a published quantity change's expiry trigger.
  select * into target_session from public.work_sessions where id=p_session_id for update;
  if not found then raise exception 'assignment_not_found'; end if;
  select * into target_team from public.today_work_teams where id=p_team_id for share;
  if not found or target_team.expires_at <= clock_timestamp() then raise exception 'expired_team'; end if;
  if target_session.farm_id <> target_team.farm_id or target_session.status <> 'PUBLISHED'
     or not exists(select 1 from public.today_work_team_members m where m.id=p_member_id and m.team_id=p_team_id and m.farm_id=target_team.farm_id)
     then raise exception 'assignment_not_found'; end if;
  select * into target_assignment from public.today_work_assignments a
  where a.team_member_id=p_member_id and a.work_session_id=p_session_id and a.farm_id=target_team.farm_id and a.revoked_at is null for update;
  if not found then raise exception 'assignment_not_found'; end if;
  if p_expected_version is distinct from target_session.current_version then raise exception 'version_conflict'; end if;
  if target_assignment.acknowledged_version is distinct from p_expected_version then
    update public.today_work_assignments a set acknowledged_version=p_expected_version,acknowledged_at=clock_timestamp()
    where a.id=target_assignment.id returning * into target_assignment;
  end if;
  return query select p_session_id,target_session.current_version,target_assignment.acknowledged_version,target_assignment.acknowledged_at;
end;
$$;

create or replace function public.rotate_today_work_team_invite(
  p_farm_id uuid,p_work_date date,p_idempotency_key text,p_invite_token_hash text,p_issued_at timestamptz,p_expires_at timestamptz
) returns setof public.today_work_teams
language plpgsql security definer set search_path = public, pg_temp as $$
declare target public.today_work_teams%rowtype;
begin
  select * into target from public.today_work_teams where farm_id=p_farm_id and work_date=p_work_date for update;
  if not found then raise exception 'today_work_team_not_found'; end if;
  if target.expires_at <= clock_timestamp() then raise exception 'expired_team'; end if;
  if target.owner_id is not null and target.activated_at is null then raise exception 'team_not_active'; end if;
  insert into public.today_work_team_invite_rotations(team_id,idempotency_key)
  values(target.id,target.invite_issue_idempotency_key) on conflict do nothing;
  if exists(select 1 from public.today_work_team_invite_rotations where team_id=target.id and idempotency_key=p_idempotency_key) then
    return next target; return;
  end if;
  update public.today_work_teams set invite_token_hash=p_invite_token_hash,invite_issue_idempotency_key=p_idempotency_key,
    issued_at=case when target.owner_id is null then p_issued_at else target.issued_at end,
    expires_at=case when target.owner_id is null then p_expires_at else target.expires_at end
  where id=target.id returning * into target;
  insert into public.today_work_team_invite_rotations(team_id,idempotency_key) values(target.id,p_idempotency_key);
  return next target;
end;
$$;

create or replace function public.p0_readiness() returns table(ready boolean)
language sql security definer set search_path = public, pg_temp as $$
  select to_regprocedure('public.authenticate_farm_owner(text,text)') is not null
     and to_regprocedure('public.provision_farm_owner(text,text,text)') is not null
     and to_regprocedure('public.rotate_today_work_team_invite(uuid,date,text,text,timestamp with time zone,timestamp with time zone)') is not null
     and to_regprocedure('public.start_temporary_work_team(uuid,uuid,uuid,text,text,text,text)') is not null
     and to_regprocedure('public.authenticate_temporary_team(uuid,text)') is not null
     and to_regprocedure('public.acknowledge_team_assignment(uuid,uuid,uuid,integer)') is not null
     and to_regclass('public.today_work_team_invite_rotations') is not null
     and to_regclass('public.demo_owners_one_active_credential_per_farm_idx') is not null;
$$;

revoke all on function public.start_temporary_work_team(uuid,uuid,uuid,text,text,text,text),
  public.authenticate_temporary_team(uuid,text),public.acknowledge_team_assignment(uuid,uuid,uuid,integer),
  public.guard_temporary_team_lifetime(),public.activate_temporary_team_on_publish(),public.guard_temporary_team_write()
  from public,anon,authenticated;
grant execute on function public.start_temporary_work_team(uuid,uuid,uuid,text,text,text,text),
  public.authenticate_temporary_team(uuid,text),public.acknowledge_team_assignment(uuid,uuid,uuid,integer) to service_role;
