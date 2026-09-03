-- Contract phase. Apply only after migrations 015/016, farm provisioning, and the
-- authenticate_farm_owner application deployment have been verified.
-- Stored legacy data and its read path are intentionally untouched.
drop function if exists public.authenticate_demo_owner(text);
drop function if exists public.seed_demo_owner(text, text);
drop function if exists public.publish_initial_draft(uuid, jsonb, text, text, text, boolean, text, text, jsonb);
drop function if exists public.publish_quantity_change(uuid, integer, jsonb);
drop function if exists public.publish_quantity_change(uuid, uuid, integer, jsonb, jsonb);
drop function if exists public.issue_worker_link(uuid, text, jsonb);
