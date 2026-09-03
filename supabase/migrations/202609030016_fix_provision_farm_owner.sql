-- Repair the OUT farm_id / ON CONFLICT column ambiguity without replacing
-- either atomic UPSERT or changing existing credentials, ACLs, or owner IDs.
create or replace function public.provision_farm_owner(
  p_farm_code text,
  p_display_name text,
  p_pin text
) returns table(owner_id uuid, farm_id uuid, farm_code text, farm_name text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
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
