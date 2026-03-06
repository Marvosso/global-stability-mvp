-- Phase 15E: API keys for enterprise API access.
-- Store key_prefix for lookup and key_hash for verification; never store raw key.
-- key_prefix should be long enough to uniquely identify the key (e.g. gs_live_ + first 8 chars of secret).

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  key_prefix text not null,
  key_hash text not null,
  tier text not null default 'enterprise',
  created_at timestamptz not null default now(),
  constraint api_keys_tier_check check (tier in ('enterprise'))
);

comment on table public.api_keys is 'Phase 15E: API keys for /api/v1/* enterprise endpoints.';
comment on column public.api_keys.key_prefix is 'Prefix of key for lookup (e.g. gs_live_abcd1234); must be unique per key.';
comment on column public.api_keys.key_hash is 'SHA-256 hash of the full key for verification.';
comment on column public.api_keys.tier is 'Key tier; only enterprise is allowed for v1 API.';

create index idx_api_keys_key_prefix on public.api_keys (key_prefix);
create index idx_api_keys_user_id on public.api_keys (user_id);

-- Ensure one row per key: prefix is unique (generated as gs_live_<random> per key).
alter table public.api_keys add constraint api_keys_key_prefix_unique unique (key_prefix);

alter table public.api_keys enable row level security;

create policy api_keys_select_system on public.api_keys
  for select using (true);

create policy api_keys_insert_system on public.api_keys
  for insert with check (true);

create policy api_keys_delete_own on public.api_keys
  for delete using (auth.uid() = user_id);
