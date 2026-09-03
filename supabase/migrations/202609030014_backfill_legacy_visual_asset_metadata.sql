-- The first eight reviewed assets predate checksum/is_current metadata.
-- Permit the manifest importer to complete those rows once without allowing
-- a later manifest to replace an asset with a different checksum.
create or replace function public.import_visual_assets_v2(p_assets jsonb)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  changed_count integer;
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
    where stored.checksum_md5 is not null
      and stored.checksum_md5 is distinct from item.value->>'checksum_md5'
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
  on conflict (id) do update set
    task_code = excluded.task_code,
    asset_type = excluded.asset_type,
    content_type = excluded.content_type,
    public_path = excluded.public_path,
    provenance = excluded.provenance,
    generator_provider = excluded.generator_provider,
    prompt_version = excluded.prompt_version,
    generated_at = excluded.generated_at,
    reviewer = excluded.reviewer,
    review_status = excluded.review_status,
    safety_level = excluded.safety_level,
    purpose = excluded.purpose,
    captions_text = excluded.captions_text,
    reviewed_at = excluded.reviewed_at,
    checksum_md5 = excluded.checksum_md5,
    is_current = excluded.is_current
  where visual_assets.checksum_md5 is null;
  get diagnostics changed_count = row_count;
  return changed_count;
end;
$$;

revoke all on function public.import_visual_assets_v2(jsonb) from public, anon, authenticated;
grant execute on function public.import_visual_assets_v2(jsonb) to service_role;
