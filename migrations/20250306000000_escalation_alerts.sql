-- Phase 5E: Escalation alerts (Smart Alerts / Escalation Detection Engine).
-- Stores clusters of events that indicate escalation; map layer and public API.

create table public.escalation_alerts (
  id uuid primary key default gen_random_uuid(),
  region_key text not null,
  category text not null,
  severity text not null,
  event_count integer not null,
  window_hours integer not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  event_ids uuid[] not null default '{}',
  centroid_lng double precision,
  centroid_lat double precision
);

create index idx_escalation_alerts_region_key on public.escalation_alerts (region_key);
create index idx_escalation_alerts_created_at on public.escalation_alerts (created_at desc);
create index idx_escalation_alerts_region_resolved on public.escalation_alerts (region_key, resolved_at);

alter table public.escalation_alerts enable row level security;

-- Public read; insert/update only via service role (cron/backend).
create policy escalation_alerts_select_all on public.escalation_alerts
  for select using (true);

create policy escalation_alerts_insert_system on public.escalation_alerts
  for insert with check (true);

create policy escalation_alerts_update_system on public.escalation_alerts
  for update using (true);
