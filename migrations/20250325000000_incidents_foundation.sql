-- Incident clustering foundation: incidents table and events.incident_id FK.
-- Requires PostGIS for geography(Point,4326).

create extension if not exists postgis with schema extensions;

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  title text,
  category text,
  subtype text,
  primary_location extensions.geography(Point,4326),
  country_code text,
  occurred_at timestamptz,
  severity text,
  confidence_level text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_incidents_occurred_at on public.incidents (occurred_at);
create index idx_incidents_category on public.incidents (category);
create index idx_incidents_primary_location on public.incidents using GIST (primary_location);

alter table public.events
  add column if not exists incident_id uuid references public.incidents (id) on delete set null;

create index events_incident_id_idx on public.events (incident_id);

comment on table public.incidents is 'Clustered incidents; events reference parent incident via incident_id.';
