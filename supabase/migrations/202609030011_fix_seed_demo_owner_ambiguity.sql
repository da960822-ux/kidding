create or replace function public.seed_demo_owner(p_farm_slug text, p_pin text)
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

  select farm.id
  into target_farm_id
  from public.farms as farm
  where farm.slug = p_farm_slug
  for update;
  if not found then raise exception 'farm_not_found'; end if;

  select owner.id
  into target_owner_id
  from public.demo_owners as owner
  where owner.farm_id = target_farm_id and owner.is_active
  for update;

  if found then
    update public.demo_owners as owner
    set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 12))
    where owner.id = target_owner_id;
  else
    insert into public.demo_owners(farm_id, pin_hash)
    values (target_farm_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 12)))
    returning id into target_owner_id;
  end if;

  return query select target_owner_id, target_farm_id;
end;
$$;

revoke all on function public.seed_demo_owner(text, text) from public, anon, authenticated;
grant execute on function public.seed_demo_owner(text, text) to service_role;
