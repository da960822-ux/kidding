-- Preserve legacy rows and assets. New v2 publication is implemented only
-- after 009 adds immutable contract-version columns and package storage.
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
    -- Legacy structure-v1 onion ontology.
    'ONION_HARVEST', 'ONION_COLLECT', 'BAGGING', 'LOADING', 'WAREHOUSE_TRANSPORT', 'STACKING',
    -- ontology-v2.
    'ONION_TRIMMING', 'ONION_SORTING', 'ONION_TRANSPORT',
    'STRAWBERRY_HARVEST', 'STRAWBERRY_SORTING', 'STRAWBERRY_INSPECTION', 'STRAWBERRY_PACKING'
  ));

comment on constraint visual_assets_task_code_check on public.visual_assets is
  'Legacy structure-v1/ontology-v1 asset codes remain readable for immutable WorkVersions; new ontology-v2 publication uses the current two-crop codes without remapping legacy records.';
