-- Add Natural Disaster category and disaster subtypes for GDACS/USGS ingestion.
do $$
begin
  if not exists (select 1 from pg_enum e join pg_type t on e.enumtypid = t.oid where t.typname = 'event_category' and e.enumlabel = 'Natural Disaster') then
    alter type event_category add value 'Natural Disaster';
  end if;
end$$;
do $$
begin
  if not exists (select 1 from pg_enum e join pg_type t on e.enumtypid = t.oid where t.typname = 'event_subtype' and e.enumlabel = 'Earthquake') then
    alter type event_subtype add value 'Earthquake';
  end if;
end$$;
do $$
begin
  if not exists (select 1 from pg_enum e join pg_type t on e.enumtypid = t.oid where t.typname = 'event_subtype' and e.enumlabel = 'Flood') then
    alter type event_subtype add value 'Flood';
  end if;
end$$;
do $$
begin
  if not exists (select 1 from pg_enum e join pg_type t on e.enumtypid = t.oid where t.typname = 'event_subtype' and e.enumlabel = 'Cyclone') then
    alter type event_subtype add value 'Cyclone';
  end if;
end$$;
do $$
begin
  if not exists (select 1 from pg_enum e join pg_type t on e.enumtypid = t.oid where t.typname = 'event_subtype' and e.enumlabel = 'Drought') then
    alter type event_subtype add value 'Drought';
  end if;
end$$;
