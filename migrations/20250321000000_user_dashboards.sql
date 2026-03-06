-- Phase 15C: User intelligence dashboards (custom filters for events, scores, escalation signals).

create table public.user_dashboards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  filters jsonb not null default '{}',
  created_at timestamptz not null default now()
);

comment on table public.user_dashboards is 'Phase 15C: user-defined dashboards with filters for events, stability scores, escalation signals.';
comment on column public.user_dashboards.name is 'Display name for the dashboard.';
comment on column public.user_dashboards.filters is 'JSON filter config (e.g. region, limit, offset) applied when querying dashboard data.';

create index idx_user_dashboards_user_id on public.user_dashboards (user_id);

alter table public.user_dashboards enable row level security;

create policy user_dashboards_select_own on public.user_dashboards
  for select using (auth.uid() = user_id);

create policy user_dashboards_insert_own on public.user_dashboards
  for insert with check (auth.uid() = user_id);

create policy user_dashboards_update_own on public.user_dashboards
  for update using (auth.uid() = user_id);

create policy user_dashboards_delete_own on public.user_dashboards
  for delete using (auth.uid() = user_id);
