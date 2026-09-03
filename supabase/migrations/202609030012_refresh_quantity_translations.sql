-- Quantity replacement is v2-only and farm-scoped. It never rewrites legacy
-- structure-v1 state: callers receive the typed legacy_read_only failure.
drop function if exists public.publish_quantity_change(uuid, integer, jsonb);
drop function if exists public.publish_quantity_change(uuid, uuid, integer, jsonb, jsonb);

create function public.publish_quantity_change(
  p_farm_id uuid,
  p_session_id uuid,
  p_expected_version integer,
  p_quantity jsonb,
  p_state_json jsonb
) returns table(version integer)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  session_row public.work_sessions%rowtype;
  old_state jsonb;
  next_version integer;
begin
  select * into session_row
  from public.work_sessions
  where id = p_session_id and farm_id = p_farm_id
  for update;
  if not found then return; end if;
  if session_row.contract_version <> 'structure-v2' or session_row.ontology_version <> 'ontology-v2' then
    raise exception 'legacy_read_only';
  end if;
  if session_row.status <> 'PUBLISHED' or session_row.current_version <> p_expected_version then return; end if;
  if jsonb_typeof(p_quantity) <> 'object' or coalesce((p_quantity->>'value')::integer, 0) < 1 or nullif(p_quantity->>'unit', '') is null then raise exception 'invalid_quantity'; end if;
  if jsonb_typeof(p_state_json) <> 'object' or p_state_json->'quantity' is distinct from p_quantity or p_state_json->>'task_family' is distinct from session_row.task_family then raise exception 'invalid_state'; end if;
  select wv.state_json into old_state
  from public.work_versions as wv
  where wv.work_session_id = p_session_id and wv.version = p_expected_version and wv.status = 'PUBLISHED'
  for update;
  if old_state is null then return; end if;
  next_version := p_expected_version + 1;
  update public.work_versions set status = 'SUPERSEDED'
  where work_session_id = p_session_id and version = p_expected_version;
  insert into public.work_versions(work_session_id, version, status, state_json, transcript, confirmation_decision, contract_version, ontology_version)
  values (p_session_id, next_version, 'PUBLISHED', p_state_json, null, 'CONFIRM', 'structure-v2', 'ontology-v2');
  update public.work_sessions set current_version = next_version, updated_at = now()
  where id = p_session_id and farm_id = p_farm_id and current_version = p_expected_version;
  return query select next_version;
end;
$$;

revoke all on function public.publish_quantity_change(uuid, uuid, integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.publish_quantity_change(uuid, uuid, integer, jsonb, jsonb) to service_role;
