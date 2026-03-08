-- Add Humanitarian Crisis category and subtypes for ReliefWeb reports mapping.
-- Subtypes: Food Crisis, Population Displacement, Disease Outbreak (Flood, Drought already exist).
-- Constraint update is in next migration so new enum values are committed before use.

do $$
begin
  if not exists (select 1 from pg_enum e join pg_type t on e.enumtypid = t.oid where t.typname = 'event_category' and e.enumlabel = 'Humanitarian Crisis') then
    alter type event_category add value 'Humanitarian Crisis';
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_enum e join pg_type t on e.enumtypid = t.oid where t.typname = 'event_subtype' and e.enumlabel = 'Food Crisis') then
    alter type event_subtype add value 'Food Crisis';
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_enum e join pg_type t on e.enumtypid = t.oid where t.typname = 'event_subtype' and e.enumlabel = 'Population Displacement') then
    alter type event_subtype add value 'Population Displacement';
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_enum e join pg_type t on e.enumtypid = t.oid where t.typname = 'event_subtype' and e.enumlabel = 'Disease Outbreak') then
    alter type event_subtype add value 'Disease Outbreak';
  end if;
end $$;
