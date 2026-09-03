-- Synthetic rows only; rollback makes this safe for the local SQL replay.
begin;
do $$
declare
  team_id uuid := gen_random_uuid();
  farm_id uuid := gen_random_uuid();
  owner_id uuid := gen_random_uuid();
  member_id uuid := gen_random_uuid();
  other_member uuid := gen_random_uuid();
  session_id uuid := gen_random_uuid();
  bootstrap_hash text := encode(extensions.gen_random_bytes(32), 'hex');
  test_pin text := lpad((floor(random() * 1000000)::int)::text, 6, '0');
  team_row public.today_work_teams%rowtype;
  repeat_row public.today_work_teams%rowtype;
  first_ack timestamptz;
  fixed_expiry timestamptz;
begin
  select * into team_row from public.start_temporary_work_team(team_id,owner_id,farm_id,bootstrap_hash,test_pin,encode(extensions.gen_random_bytes(32),'hex'),'initial-invite-key');
  if team_row.activated_at is not null or team_row.expires_at <> team_row.created_at + interval '1 hour' then raise exception 'pending workspace must expire after one hour'; end if;
  if team_row.owner_pin_hash = test_pin then raise exception 'PIN stored in plaintext'; end if;
  if exists(select 1 from public.authenticate_temporary_team(team_id,test_pin)) then raise exception 'pending PIN must not authenticate'; end if;
  select * into repeat_row from public.start_temporary_work_team(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),bootstrap_hash,test_pin,encode(extensions.gen_random_bytes(32),'hex'),'retry-invite-key');
  if repeat_row.id <> team_id then raise exception 'retry created a duplicate team'; end if;
  -- Activation belongs to the same transaction as publishing: any later failure rolls it back.
  begin
    insert into public.work_sessions(id,farm_id,location,task_family,status,current_version,contract_version,ontology_version)
    values(session_id,farm_id,'{}','ONION','PUBLISHED',1,'structure-v2','ontology-v2');
    raise exception 'simulate_package_failure';
  exception when raise_exception then
    if sqlerrm <> 'simulate_package_failure' then raise; end if;
  end;
  if (select activated_at from public.today_work_teams where id=team_id) is not null then raise exception 'failed publish activated team'; end if;
  insert into public.work_sessions(id,farm_id,location,task_family,status,current_version,contract_version,ontology_version)
  values(session_id,farm_id,'{}','ONION','PUBLISHED',1,'structure-v2','ontology-v2');
  select * into team_row from public.today_work_teams where id=team_id;
  fixed_expiry := team_row.expires_at;
  if fixed_expiry <> team_row.activated_at + interval '24 hours' then raise exception 'team lifetime must be full24h'; end if;
  if not exists(select 1 from public.authenticate_temporary_team(team_id,test_pin)) then raise exception 'active PIN must authenticate'; end if;
  if exists(select 1 from public.authenticate_temporary_team(team_id,'badpin')) then raise exception 'incorrect PIN accepted'; end if;
  if exists(select 1 from public.authenticate_farm_owner((select slug from public.farms where id=farm_id),test_pin)) then raise exception 'temporary team bypass via legacy auth'; end if;
  insert into public.work_sessions(farm_id,location,task_family,status,current_version,contract_version,ontology_version)
  values(farm_id,'{}','STRAWBERRY','PUBLISHED',1,'structure-v2','ontology-v2');
  perform public.rotate_today_work_team_invite(farm_id,team_row.work_date,'rotated-invite-key',encode(extensions.gen_random_bytes(32),'hex'),now(),now()+interval '48 hours');
  if (select expires_at from public.today_work_teams where id=team_id) <> fixed_expiry then raise exception 'rotation extended lifetime'; end if;
  insert into public.today_work_team_members(id,team_id,farm_id,display_name,language_code,join_idempotency_key)
  values(member_id,team_id,farm_id,'First','vi','join-first'),(other_member,team_id,farm_id,'Second','ne','join-second');
  insert into public.today_work_assignments(team_member_id,work_session_id,farm_id) values(member_id,session_id,farm_id);
  if (select acknowledged_version from public.today_work_assignments where team_member_id=member_id) is not null then raise exception 'assignment auto-acknowledged'; end if;
  begin
    perform public.acknowledge_team_assignment(team_id,other_member,session_id,1);
    raise exception 'foreign_assignment_accepted';
  exception when raise_exception then
    if sqlerrm <> 'assignment_not_found' then raise; end if;
  end;
  select acknowledged_at into first_ack from public.acknowledge_team_assignment(team_id,member_id,session_id,1);
  if (select acknowledged_at from public.acknowledge_team_assignment(team_id,member_id,session_id,1)) <> first_ack then raise exception 'duplicate ack changed timestamp'; end if;
  update public.work_sessions set current_version=2 where id=session_id;
  if (select expires_at from public.today_work_teams where id=team_id) <> fixed_expiry then raise exception 'update extended lifetime'; end if;
  begin
    perform public.acknowledge_team_assignment(team_id,member_id,session_id,1);
    raise exception 'stale_ack_accepted';
  exception when raise_exception then
    if sqlerrm <> 'version_conflict' then raise; end if;
  end;
  if (select acknowledged_version from public.acknowledge_team_assignment(team_id,member_id,session_id,2)) <> 2 then raise exception 'latest acknowledgement failed'; end if;
  -- Simulate time passing using fixture-only trigger suspension; production has immutable clocks.
  alter table public.today_work_teams disable trigger temporary_team_fixed_lifetime;
  update public.today_work_teams set issued_at=now()-interval '25 hours', activated_at=now()-interval '25 hours', expires_at=now()-interval '1 hour' where id=team_id;
  alter table public.today_work_teams enable trigger temporary_team_fixed_lifetime;
  if exists(select 1 from public.authenticate_temporary_team(team_id,test_pin)) then raise exception 'expired PIN accepted'; end if;
  begin
    perform public.acknowledge_team_assignment(team_id,member_id,session_id,2);
    raise exception 'expired_ack_accepted';
  exception when raise_exception then
    if sqlerrm <> 'expired_team' then raise; end if;
  end;
  begin
    update public.work_sessions set current_version=3 where id=session_id;
    raise exception 'expired_mutation_accepted';
  exception when raise_exception then
    if sqlerrm <> 'expired_team' then raise; end if;
  end;
  if has_function_privilege('anon','public.start_temporary_work_team(uuid,uuid,uuid,text,text,text,text)','EXECUTE')
     or has_function_privilege('authenticated','public.authenticate_temporary_team(uuid,text)','EXECUTE')
     or has_function_privilege('anon','public.acknowledge_team_assignment(uuid,uuid,uuid,integer)','EXECUTE') then raise exception 'public RPC access granted'; end if;
end;
$$;
rollback;
