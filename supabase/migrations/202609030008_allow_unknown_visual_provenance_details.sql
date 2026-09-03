-- Keep required provenance category and human review gates. Historical AI assets
-- can lack recoverable generator details; preserve that unknown as NULL.
alter table public.visual_assets
  alter column prompt_version drop not null,
  alter column generated_at drop not null;
