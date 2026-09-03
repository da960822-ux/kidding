-- Keep historical asset rows intact. New manifest metadata is additive and
-- unknown historical generation metadata remains null rather than invented.
alter table public.visual_assets add column if not exists content_type text;
alter table public.visual_assets add column if not exists reviewed_at timestamptz;
alter table public.visual_assets add column if not exists checksum_md5 text;
alter table public.visual_assets add column if not exists is_current boolean not null default false;
alter table public.visual_assets alter column prompt_version drop not null;
alter table public.visual_assets alter column generated_at drop not null;

create unique index if not exists visual_assets_v2_current_approved_low_task_code_key
  on public.visual_assets(task_code)
  where asset_type = 'VIDEO'
    and review_status = 'APPROVED'
    and safety_level = 'LOW'
    and is_current
    and task_code in (
      'ONION_HARVEST', 'ONION_TRIMMING', 'ONION_SORTING', 'ONION_TRANSPORT',
      'STRAWBERRY_HARVEST', 'STRAWBERRY_SORTING', 'STRAWBERRY_INSPECTION', 'STRAWBERRY_PACKING'
    );

create function public.import_visual_assets_v2(p_assets jsonb)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  inserted_count integer;
begin
  if jsonb_typeof(p_assets) <> 'array' or jsonb_array_length(p_assets) <> 8 then
    raise exception 'invalid_visual_asset_manifest';
  end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_assets)) <> 8
     or (select count(distinct value->>'task_code') from jsonb_array_elements(p_assets)) <> 8 then
    raise exception 'invalid_visual_asset_manifest';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_assets) as item(value)
    where nullif(value->>'id', '') is null
       or nullif(value->>'task_code', '') is null
       or value->>'asset_type' <> 'VIDEO'
       or value->>'content_type' <> 'video/mp4'
       or nullif(value->>'public_path', '') is null
       or value->>'provenance' <> 'AI_GENERATED_PREGENERATED'
       or nullif(value->>'reviewer', '') is null
       or value->>'review_status' <> 'APPROVED'
       or value->>'safety_level' <> 'LOW'
       or nullif(value->>'purpose', '') is null
       or nullif(value->>'captions_text', '') is null
       or nullif(value->>'reviewed_at', '') is null
       or coalesce(value->>'checksum_md5', '') !~ '^[0-9a-f]{32}$'
       or (value->>'is_current')::boolean is distinct from true
  ) then
    raise exception 'invalid_visual_asset_manifest';
  end if;
  if exists (
    select 1
    from (values
      ('ONION_HARVEST'), ('ONION_TRIMMING'), ('ONION_SORTING'), ('ONION_TRANSPORT'),
      ('STRAWBERRY_HARVEST'), ('STRAWBERRY_SORTING'), ('STRAWBERRY_INSPECTION'), ('STRAWBERRY_PACKING')
    ) as required(task_code)
    where not exists (
      select 1 from jsonb_array_elements(p_assets) as item(value)
      where value->>'task_code' = required.task_code
    )
  ) then
    raise exception 'invalid_visual_asset_manifest';
  end if;
  if exists (
    select 1
    from public.visual_assets as stored
    join jsonb_array_elements(p_assets) as item(value) on stored.id = item.value->>'id'
    where stored.checksum_md5 is distinct from item.value->>'checksum_md5'
  ) then
    raise exception 'checksum_mismatch';
  end if;

  insert into public.visual_assets (
    id, task_code, asset_type, content_type, public_path, provenance,
    generator_provider, prompt_version, generated_at, reviewer, review_status,
    safety_level, purpose, captions_text, reviewed_at, checksum_md5, is_current
  )
  select
    item.id, item.task_code, item.asset_type, item.content_type, item.public_path,
    item.provenance, item.generator_provider, item.prompt_version, item.generated_at,
    item.reviewer, item.review_status, item.safety_level, item.purpose,
    item.captions_text, item.reviewed_at, item.checksum_md5, item.is_current
  from jsonb_to_recordset(p_assets) as item(
    id text, task_code text, asset_type text, content_type text, public_path text,
    provenance text, generator_provider text, prompt_version text, generated_at timestamptz,
    reviewer text, review_status text, safety_level text, purpose text, captions_text text,
    reviewed_at timestamptz, checksum_md5 text, is_current boolean
  )
  on conflict (id) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.import_visual_assets_v2(jsonb) from public, anon, authenticated;
grant execute on function public.import_visual_assets_v2(jsonb) to service_role;

-- PIN is supplied later by deployment secret through seed_demo_owner.
insert into public.farms (slug, display_name, is_legacy_seed)
values ('demo-farm', 'Demo farm', false)
on conflict (slug) do nothing;

-- v1 rows remain queryable, but this historical publish RPC must never create
-- another v1 version after the structure-v2 cutover.
revoke all on function public.publish_initial_draft(uuid, jsonb, text, text, text, boolean, text, text, jsonb) from service_role;
