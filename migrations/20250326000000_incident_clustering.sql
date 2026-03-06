-- Incident clustering: find matching incident by category, time window, and distance.
-- Uses PostGIS ST_DWithin for spatial matching (100km).

create or replace function public.find_matching_incident(
  p_category text,
  p_occurred_at timestamptz,
  p_lng double precision,
  p_lat double precision
)
returns uuid
language sql
security definer
set search_path = public, extensions
as $$
  select i.id
  from public.incidents i
  where i.category = p_category
    and i.occurred_at is not null
    and i.occurred_at >= p_occurred_at - interval '12 hours'
    and i.occurred_at <= p_occurred_at + interval '12 hours'
    and i.primary_location is not null
    and st_dwithin(
      i.primary_location,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
      100000
    )
  limit 1;
$$;

comment on function public.find_matching_incident is 'Returns incident id if one exists within same category, ±12h, and 100km. Used for clustering duplicate events.';
