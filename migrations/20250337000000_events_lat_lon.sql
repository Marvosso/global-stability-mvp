-- Explicit lat/lon columns for maps and API (in addition to primary_location text).
alter table public.events
  add column if not exists lat double precision,
  add column if not exists lon double precision;

comment on column public.events.lat is 'Event latitude in WGS84; prefer over parsing primary_location when set.';
comment on column public.events.lon is 'Event longitude in WGS84; prefer over parsing primary_location when set.';
