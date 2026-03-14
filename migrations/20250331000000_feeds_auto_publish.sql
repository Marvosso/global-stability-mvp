-- Optional: add auto_publish to feeds so ingestion can auto-publish trusted disaster feeds.
-- Code currently uses feed_key (usgs_eq, gdacs_rss) in createDraftEvent; this column
-- allows future centralization (e.g. read auto_publish from feeds when creating events).
alter table public.feeds
  add column if not exists auto_publish boolean not null default false;

update public.feeds
set auto_publish = true
where feed_key in ('usgs_eq', 'usgs', 'gdacs_rss', 'gdacs')
  and (auto_publish is null or auto_publish = false);

comment on column public.feeds.auto_publish is 'When true, events from this feed are created with status Published (trusted disaster feeds).';
