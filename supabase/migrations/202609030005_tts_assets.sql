create table if not exists public.tts_assets (
  text_hash text not null check (text_hash ~ '^[0-9a-f]{64}$'),
  language_code text not null check (language_code in ('vi', 'ne')),
  audio_bytes bytea not null check (octet_length(audio_bytes) > 0),
  content_type text not null check (content_type = 'audio/mpeg'),
  created_at timestamptz not null default now(),
  primary key (text_hash, language_code)
);

alter table public.tts_assets enable row level security;
revoke all on public.tts_assets from anon, authenticated;
grant select, insert, update on public.tts_assets to service_role;
