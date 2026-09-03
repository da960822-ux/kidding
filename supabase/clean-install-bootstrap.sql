-- Run once, and only on an empty Supabase database, before migrations.
-- Migration 009 revokes this historical overload before migration 012 creates it.
-- Applied migration files stay immutable, so this temporary stub closes that
-- clean-install ordering gap. Migration 012 drops it; the final legacy cleanup
-- removes the replacement after the current API cutover.

begin;

do $$
begin
  if exists (
       select 1 from pg_class relation
       join pg_namespace namespace on namespace.oid = relation.relnamespace
       where namespace.nspname = 'public' and relation.relkind in ('r', 'p')
     )
     or to_regprocedure('public.publish_quantity_change(uuid,uuid,integer,jsonb,jsonb)') is not null then
    raise exception 'clean_install_bootstrap_requires_empty_database';
  end if;
end;
$$;

create function public.publish_quantity_change(
  p_farm_id uuid,
  p_session_id uuid,
  p_expected_version integer,
  p_quantity jsonb,
  p_state_json jsonb
) returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'clean_install_bootstrap_stub_not_callable';
end;
$$;

revoke all on function public.publish_quantity_change(uuid, uuid, integer, jsonb, jsonb)
  from public, anon, authenticated, service_role;

commit;
