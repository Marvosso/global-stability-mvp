-- User watchlists (Phase 5A).
-- Requires auth.users (Supabase Auth).

create table public.user_watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text,
  categories text[] not null default '{}',
  severities text[] not null default '{}',
  confidence_levels text[] not null default '{}',
  countries text[] not null default '{}',
  bbox jsonb,
  created_at timestamptz not null default now()
);

create index idx_user_watchlists_user_id on public.user_watchlists (user_id);

alter table public.user_watchlists enable row level security;

create policy user_watchlists_select_own on public.user_watchlists
  for select using (auth.uid() = user_id);

create policy user_watchlists_insert_own on public.user_watchlists
  for insert with check (auth.uid() = user_id);

create policy user_watchlists_update_own on public.user_watchlists
  for update using (auth.uid() = user_id);

create policy user_watchlists_delete_own on public.user_watchlists
  for delete using (auth.uid() = user_id);
