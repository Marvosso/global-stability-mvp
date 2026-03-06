-- Add Wildfire subtype for NASA FIRMS ingestion.
-- Must be in its own migration: new enum values cannot be used in the same transaction.
do $$
begin
  if not exists (select 1 from pg_enum e join pg_type t on e.enumtypid = t.oid where t.typname = 'event_subtype' and e.enumlabel = 'Wildfire') then
    alter type event_subtype add value 'Wildfire';
  end if;
end$$;
