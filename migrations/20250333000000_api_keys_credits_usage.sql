-- API keys: add credits and tier (free/pro/enterprise); api_usage for dashboard.

-- Drop existing tier constraint and add new columns
alter table public.api_keys drop constraint if exists api_keys_tier_check;

alter table public.api_keys
  add column if not exists credits_remaining int not null default 500,
  add column if not exists credits_reset_at timestamptz;

-- Set crediats_reset_at for existing rows to end of current month (so next reset is next month)
update public.api_keys
set credits_reset_at = date_trunc('month', now() + interval '1 month')
where credits_reset_at is null;

-- New tier check: free, pro, enterprise
alter table public.api_keys
  add constraint api_keys_tier_check check (tier in ('free', 'pro', 'enterprise'));

-- Backfill credits for existing enterprise keys (had no credits columns before)
update public.api_keys
set credits_remaining = 50000,
    credits_reset_at = date_trunc('month', now() + interval '1 month')
where tier = 'enterprise' and credits_reset_at is null;

comment on column public.api_keys.credits_remaining is 'Credits left for this key; 1 credit per API call. Reset at credits_reset_at for free tier (500/mo).';
comment on column public.api_keys.credits_reset_at is 'When to reset credits_remaining (e.g. start of next month for free tier).';

-- Usage log for dashboard and analytics
create table if not exists public.api_usage (
  id uuid primary key default gen_random_uuid(),
  api_key_id uuid not null references public.api_keys (id) on delete cascade,
  used_at timestamptz not null default now(),
  endpoint text not null,
  request_id text,
  credits_used int not null default 1
);

create index idx_api_usage_api_key_id on public.api_usage (api_key_id);
create index idx_api_usage_used_at on public.api_usage (used_at);

comment on table public.api_usage is 'Log of API key usage for dashboard and billing.';

alter table public.api_usage enable row level security;

create policy api_usage_select_system on public.api_usage
  for select using (true);

create policy api_usage_insert_system on public.api_usage
  for insert with check (true);

-- Atomic decrement for credits (1 per call)
create or replace function public.decrement_api_key_credits(p_key_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  new_credits int;
begin
  update public.api_keys
  set credits_remaining = greatest(0, credits_remaining - 1)
  where id = p_key_id
  returning credits_remaining into new_credits;
  return new_credits;
end;
$$;
