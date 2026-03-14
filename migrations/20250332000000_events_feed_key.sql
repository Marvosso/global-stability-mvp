-- Add feed_key to events for review dashboard and filtering (e.g. bulk approve by feed).
alter table public.events
  add column if not exists feed_key text;

comment on column public.events.feed_key is 'Originating feed key from ingestion (e.g. usgs_eq, gdacs_rss). Used for review dashboard and bulk approve.';
