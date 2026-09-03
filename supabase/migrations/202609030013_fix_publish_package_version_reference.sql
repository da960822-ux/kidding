-- Repair the v2 package-publish function without changing any stored version.
-- `version` is also an OUT parameter, so the prior unqualified update caused
-- PostgreSQL 42702 during quantity regeneration.
create or replace function public.publish_work_version_with_packages(
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

  insert into public.work_versions(work_session_id, version, status, state_json, transcript, confirmation_decision, ambiguity_override, override_reason, contract_version, ontology_version)
  values (p_session_id, next_version, case when next_version = 1 then 'PUBLISHED' else 'SUPERSEDED' end, p_state_json, null, p_decision, p_ambiguity_override, p_override_reason, 'structure-v2', 'ontology-v2')
  returning id into new_version_id;
  insert into public.worker_briefing_packages(work_version_id, language_code, contract_version, ontology_version, package_json)
  select new_version_id, value->>'language_code', 'worker-briefing-v2', 'ontology-v2', value
  from jsonb_array_elements(p_packages);

  if next_version > 1 then
    update public.work_versions as previous_version
    set status = 'SUPERSEDED'
    where previous_version.work_session_id = p_session_id
      and previous_version.version = p_expected_version
      and previous_version.status = 'PUBLISHED';
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
