-- Allow Wildfire in events_category_subtype_valid (enum value added in previous migration).
alter table public.events
  drop constraint if exists events_category_subtype_valid;

alter table public.events
  add constraint events_category_subtype_valid check (
    subtype is null
    or (
      (category = 'Armed Conflict' and subtype in ('Battle', 'Targeted Assassination', 'Air Strike', 'Border Skirmish'))
      or (category = 'Political Tension' and subtype in ('Protest', 'Legislation Dispute', 'Government Crisis'))
      or (category = 'Natural Disaster' and subtype in ('Earthquake', 'Flood', 'Cyclone', 'Drought', 'Wildfire'))
    )
  );
