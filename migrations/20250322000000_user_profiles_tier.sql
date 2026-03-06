-- Phase 15D: Feature tiers. user_role stored in auth.users.app_metadata (user_role);
-- This table provides an optional store for admin UI / reporting; app reads from app_metadata by default.

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  user_role text not null default 'free',
  constraint user_profiles_user_role_check check (
    user_role in ('free', 'premium', 'enterprise')
  )
);

comment on table public.user_profiles is 'Phase 15D: optional store for user feature tier; primary source is app_metadata.user_role.';
comment on column public.user_profiles.user_role is 'Feature tier: free, premium, enterprise.';

create index idx_user_profiles_user_role on public.user_profiles (user_role);

alter table public.user_profiles enable row level security;

-- Users can read own row; service role can insert/update (e.g. on signup or admin set tier).
create policy user_profiles_select_own on public.user_profiles
  for select using (auth.uid() = user_id);

create policy user_profiles_insert_system on public.user_profiles
  for insert with check (true);

create policy user_profiles_update_system on public.user_profiles
  for update using (true);
