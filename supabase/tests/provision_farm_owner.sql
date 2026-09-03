-- Run with `supabase db query --linked --file ...`; all test rows roll back.
begin;
do $$
declare
  test_code text := 'rpc-test-' || substr(md5(random()::text), 1, 12);
  test_pin text := encode(extensions.gen_random_bytes(16), 'hex');
  rotated_pin text := encode(extensions.gen_random_bytes(16), 'hex');
  first_owner uuid;
  repeated_owner uuid;
  matched integer;
begin
  select owner_id into first_owner from public.provision_farm_owner(test_code, 'RPC test', test_pin);
  select count(*) into matched from public.authenticate_farm_owner(test_code, test_pin);
  if matched <> 1 then raise exception 'new credential must authenticate'; end if;
  select owner_id into repeated_owner from public.provision_farm_owner(test_code, 'RPC test', rotated_pin);
  if first_owner is distinct from repeated_owner then raise exception 'rotation must preserve owner identity'; end if;
  select count(*) into matched from public.authenticate_farm_owner(test_code, test_pin);
  if matched <> 0 then raise exception 'old PIN must stop authenticating'; end if;
  select count(*) into matched from public.authenticate_farm_owner(test_code, rotated_pin);
  if matched <> 1 then raise exception 'rotated PIN must authenticate'; end if;
  select count(*) into matched from public.demo_owners o join public.farms f on f.id=o.farm_id where f.slug=test_code and o.is_active;
  if matched <> 1 then raise exception 'farm must retain exactly one active credential'; end if;
end;
$$;
rollback;
