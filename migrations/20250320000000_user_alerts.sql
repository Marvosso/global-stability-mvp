-- Phase 15B: User alerts (one per user-event, alert_type, seen).
-- When published events match watchlists, rows are created here and in alerts.

create table public.user_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  alert_type text not null,
  created_at timestamptz not null default now(),
  seen boolean not null default false,
  constraint user_alerts_unique_user_event unique (user_id, event_id)
);

comment on table public.user_alerts is 'Phase 15B: one alert per user per event (e.g. watchlist_match).';
comment on column public.user_alerts.alert_type is 'Type of alert, e.g. watchlist_match.';
comment on column public.user_alerts.seen is 'Whether the user has marked this alert as seen.';

create index idx_user_alerts_user_id on public.user_alerts (user_id);
create index idx_user_alerts_user_id_created_at on public.user_alerts (user_id, created_at desc);

alter table public.user_alerts enable row level security;

create policy user_alerts_select_own on public.user_alerts
  for select using (auth.uid() = user_id);

create policy user_alerts_insert_system on public.user_alerts
  for insert with check (true);

create policy user_alerts_update_own on public.user_alerts
  for update using (auth.uid() = user_id);

create policy user_alerts_delete_own on public.user_alerts
  for delete using (auth.uid() = user_id);
