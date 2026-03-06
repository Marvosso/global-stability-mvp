-- Phase 10C: Add admin1 (first-level admin division) to events for reverse geocode.
-- country_code already exists (Phase 5B).

alter table public.events
  add column if not exists admin1 text;

comment on column public.events.admin1 is 'First-level admin division (state/province) from reverse geocode.';
