-- Phase 15A: Replace user_watchlists with row-based model (watch_type, watch_value).
-- Renames existing table to user_watchlist_filters, creates new user_watchlists,
-- updates alerts FK and clears old alerts.

-- 1. Drop FK from alerts to user_watchlists (constraint name from create table)
alter table public.alerts
  drop constraint if exists alerts_watchlist_id_fkey;

-- 2. Rename existing watchlists table
alter table public.user_watchlists rename to user_watchlist_filters;

-- 3. Create new user_watchlists (Phase 15A schema)
create table public.user_watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  watch_type text not null,
  watch_value text not null,
  email_notifications boolean not null default false,
  created_at timestamptz not null default now(),
  constraint user_watchlists_watch_type_check check (
    watch_type in ('country', 'category', 'actor')
  )
);

comment on table public.user_watchlists is 'Phase 15A: one row per watched item (country, category, or actor).';
comment on column public.user_watchlists.watch_type is 'Type of watch: country, category, or actor.';
comment on column public.user_watchlists.watch_value is 'Value to match (e.g. ISO country code, category name, actor name).';
comment on column public.user_watchlists.email_notifications is 'When true, send email when a new alert is created for this entry.';

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

-- 4. Clear alerts (old watchlist_id values refer to user_watchlist_filters)
truncate table public.alerts;

-- 5. Add FK from alerts to new user_watchlists
alter table public.alerts
  add constraint alerts_watchlist_id_fkey
  foreign key (watchlist_id) references public.user_watchlists (id) on delete cascade;
