-- RPC to fetch incident candidates for weighted matching.
-- Pre-filters by category, ±48h time window, and 500km spatial distance.
-- Returns primary_location as "lat,lng" text for JS distance scoring.

create or replace function public.get_incident_candidates(
  p_category text,
  p_occurred_at timestamptz,
  p_lng double precision,
  p_lat double precision,
  p_limit int default 20
)
returns table (
  id uuid,
  title text,
  category text,
  subtype text,
  primary_location text,
  occurred_at timestamptz,
  event_count bigint
)
language sql
security definer
set search_path = public, extensions
as $$
  select
    i.id,
    i.title,
    i.category,
    i.subtype,
    st_y(i.primary_location::geometry)::text || ',' || st_x(i.primary_location::geometry)::text as primary_location,
    i.occurred_at,
    (select count(*) from public.events e where e.incident_id = i.id)::bigint as event_count
  from public.incidents i
  where i.category = p_category
    and i.occurred_at is not null
    and i.occurred_at >= p_occurred_at - interval '48 hours'
    and i.occurred_at <= p_occurred_at + interval '48 hours'
    and i.primary_location is not null
    and st_dwithin(
      i.primary_location,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
      500000
    )
  order by i.occurred_at desc
  limit p_limit;
$$;

comment on function public.get_incident_candidates is 'Returns incident candidates for weighted matching: same category, ±48h, within 500km.';
