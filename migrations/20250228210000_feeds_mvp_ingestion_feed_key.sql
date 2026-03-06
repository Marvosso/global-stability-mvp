-- Feed ingestion framework: add feed_key, enforce payload NOT NULL.
-- Backfill feed_key from source_name for existing rows.

alter table public.ingestion_items
  add column if not exists feed_key text;

update public.ingestion_items
  set feed_key = coalesce(source_name, 'unknown')
  where feed_key is null;

alter table public.ingestion_items
  alter column feed_key set not null;

update public.ingestion_items
  set payload = coalesce(payload, '{}'::jsonb)
  where payload is null;

alter table public.ingestion_items
  alter column payload set not null,
  alter column payload set default '{}'::jsonb;

-- Optional: run log for batch ingest scripts
create table if not exists public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  feed_key text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  items_fetched int,
  processed int,
  skipped int,
  status text
);

create index if not exists idx_ingestion_runs_feed_key_started_at
  on public.ingestion_runs (feed_key, started_at desc);
