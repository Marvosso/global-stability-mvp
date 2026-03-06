-- Public map items: incidents with source_count + standalone events for GET /api/public/events.
-- Returns one row per incident (with event count) and one per standalone event.

create or replace function public.get_public_map_items(p_limit int default 500, p_offset int default 0)
returns table (
  id uuid,
  incident_id uuid,
  title text,
  category text,
  subtype text,
  severity text,
  confidence_level text,
  primary_location text,
  occurred_at timestamptz,
  source_count bigint,
  country_code text
)
language sql
security definer
set search_path = public, extensions
as $$
  select * from (
    select
      i.id,
      i.id as incident_id,
      i.title,
      i.category,
      i.subtype,
      i.severity,
      i.confidence_level,
      case when i.primary_location is not null
        then round(extensions.st_y(i.primary_location::geometry)::numeric, 6)::text || ',' || round(extensions.st_x(i.primary_location::geometry)::numeric, 6)::text
        else null
      end as primary_location,
      i.occurred_at,
      (select count(*) from events e where e.incident_id = i.id and e.status = 'Published') as source_count,
      i.country_code
    from incidents i
    where exists (select 1 from events e where e.incident_id = i.id and e.status = 'Published')
    union all
    select
      e.id,
      null::uuid,
      e.title,
      e.category,
      e.subtype,
      e.severity::text,
      e.confidence_level::text,
      e.primary_location,
      e.occurred_at,
      1::bigint,
      e.country_code
    from events e
    where e.incident_id is null and e.status = 'Published'
  ) sub
  order by occurred_at desc nulls last, id
  limit p_limit offset p_offset;
$$;

comment on function public.get_public_map_items is 'Returns map items: incidents with source_count and standalone events for public map.';
