-- Feed registry: enable/disable and default config per feed without code changes.
create table public.feeds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  feed_key text not null unique,
  type text,
  category_default text,
  severity_default text,
  enabled boolean not null default true,
  interval_minutes int,
  last_run timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_feeds_feed_key_enabled on public.feeds (feed_key) where enabled = true;

-- RLS: allow service role full access; public read-only for enabled feeds if needed later.
alter table public.feeds enable row level security;

create policy "Service role full access on feeds"
  on public.feeds for all
  using (true)
  with check (true);

-- Seed existing feeds (canonical feed_key used by scripts/ingest and ingestion_runs).
insert into public.feeds (name, feed_key, type, category_default, severity_default, enabled, interval_minutes)
values
  ('USGS Earthquakes', 'usgs_eq', 'geojson', 'Natural Disaster', 'Low', true, 60),
  ('GDACS RSS', 'gdacs_rss', 'rss', 'Natural Disaster', 'Medium', true, 120),
  ('NASA FIRMS Fire', 'firms_fire', 'csv', 'Natural Disaster', 'Medium', true, 360),
  ('GDELT Events', 'gdelt', 'api', null, null, true, 360),
  ('CrisisWatch RSS', 'crisiswatch', 'rss', null, null, true, 360)
on conflict (feed_key) do nothing;
