create table if not exists public.guide_phrases (
  phrase_key text primary key,
  category text not null check (category in ('WORK_TERM', 'WORK_INSTRUCTION', 'SAFETY')),
  canonical_ko text not null,
  phrase_type text not null,
  source_name text,
  source_page integer check (source_page is null or source_page >= 1),
  source_url text,
  license text,
  verified boolean not null default false,
  check (not verified or (source_page is not null and source_url is not null and license is not null))
);

create table if not exists public.guide_translations (
  phrase_key text not null references public.guide_phrases(phrase_key) on delete cascade,
  language_code text not null check (language_code in ('vi', 'ne')),
  translated_text text not null,
  verified boolean not null default false,
  primary key (phrase_key, language_code)
);

create table if not exists public.visual_assets (
  id text primary key,
  task_code text not null check (task_code in ('ONION_HARVEST', 'ONION_COLLECT', 'BAGGING', 'LOADING', 'WAREHOUSE_TRANSPORT', 'STACKING')),
  asset_type text not null default 'VIDEO',
  public_path text not null,
  provenance text not null check (provenance = 'AI_GENERATED_PREGENERATED'),
  generator_provider text,
  prompt_version text not null,
  generated_at timestamptz not null,
  reviewer text,
  review_status text not null check (review_status in ('PENDING', 'APPROVED', 'REJECTED')),
  safety_level text not null check (safety_level in ('LOW', 'HIGH')),
  purpose text not null,
  captions_text text not null
);

create index if not exists guide_translations_language_idx on public.guide_translations (language_code);
create index if not exists visual_assets_task_review_idx on public.visual_assets (task_code, review_status, safety_level);

alter table public.guide_phrases enable row level security;
alter table public.guide_translations enable row level security;
alter table public.visual_assets enable row level security;
revoke all on public.guide_phrases, public.guide_translations, public.visual_assets from anon, authenticated;
