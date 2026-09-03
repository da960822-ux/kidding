-- P0 ontology changes from six onion-only codes to four onion and four strawberry codes.
-- Do not silently rewrite immutable work_versions. Reset legacy test sessions first if they use retired codes.
do $$
begin
  if exists (
    select 1
    from public.work_versions
    cross join lateral jsonb_array_elements(coalesce(state_json->'steps', '[]'::jsonb)) as step(value)
    where step.value->>'task_code' in ('ONION_COLLECT', 'BAGGING', 'LOADING', 'WAREHOUSE_TRANSPORT', 'STACKING')
  ) then
    raise exception 'legacy work versions use retired task codes; reset those sessions before applying 202609030007';
  end if;
end
$$;

alter table public.work_sessions
  drop constraint if exists work_sessions_task_family_check;
alter table public.work_sessions
  add constraint work_sessions_task_family_check
  check (task_family in ('ONION', 'STRAWBERRY'));

alter table public.visual_assets
  drop constraint if exists visual_assets_task_code_check;
alter table public.visual_assets
  add constraint visual_assets_task_code_check
  check (task_code in (
    'ONION_HARVEST', 'ONION_TRIMMING', 'ONION_SORTING', 'ONION_TRANSPORT',
    'STRAWBERRY_HARVEST', 'STRAWBERRY_SORTING', 'STRAWBERRY_INSPECTION', 'STRAWBERRY_PACKING'
  ));

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
  new_task_family text;
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
  new_task_family := p_state_json->>'task_family';
  if new_task_family not in ('ONION', 'STRAWBERRY') then
    raise exception 'invalid_task_family';
  end if;
  insert into public.work_sessions(location, task_family, status, current_version)
  values (coalesce(p_state_json->'location', '{}'::jsonb), new_task_family, 'PUBLISHED', 1)
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

revoke all on function public.publish_initial_draft(uuid, jsonb, text, text, text, boolean, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.publish_initial_draft(uuid, jsonb, text, text, text, boolean, text, text, jsonb) to service_role;
