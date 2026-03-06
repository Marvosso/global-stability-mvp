-- Phase 5B: Alerts for published events matching user watchlists.
-- Requires: auth.users, public.events, public.user_watchlists.

-- Optional: event country for watchlist location matching (country filter).
alter table public.events
  add column if not exists country_code text;
comment on column public.events.country_code is 'ISO country code or name for watchlist location matching.';

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  watchlist_id uuid not null references public.user_watchlists (id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint alerts_unique_user_event_watchlist unique (user_id, event_id, watchlist_id)
);

create index idx_alerts_user_id on public.alerts (user_id);
create index idx_alerts_user_id_read_at on public.alerts (user_id, read_at);
create index idx_alerts_event_id on public.alerts (event_id);

alter table public.alerts enable row level security;

create policy alerts_select_own on public.alerts
  for select using (auth.uid() = user_id);

create policy alerts_insert_system on public.alerts
  for insert with check (true);

create policy alerts_update_own on public.alerts
  for update using (auth.uid() = user_id);

create policy alerts_delete_own on public.alerts
  for delete using (auth.uid() = user_id);
