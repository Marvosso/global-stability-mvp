-- Ingestion dedupe table: one row per source_url (e.g. feed item URL).
-- Scripts insert New, call ingest API, then set Processed/Skipped.

create table public.ingestion_items (
  id uuid primary key default gen_random_uuid(),
  source_url text not null,
  source_name text,
  payload jsonb,
  status text not null default 'New' check (status in ('New', 'Processed', 'Skipped')),
  created_at timestamptz not null default now(),
  constraint ingestion_items_source_url_unique unique (source_url)
);

create index idx_ingestion_items_status_created_at
on public.ingestion_items (status, created_at desc);
