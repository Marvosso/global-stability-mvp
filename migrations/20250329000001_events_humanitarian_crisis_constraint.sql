-- Allow Humanitarian Crisis category with its subtypes (enum values added in previous migration).
-- Runs in a separate migration so new enum values are committed before use.

alter table public.events
  drop constraint if exists events_category_subtype_valid;

alter table public.events
  add constraint events_category_subtype_valid check (
    subtype is null
    or (
      (category = 'Armed Conflict' and subtype in ('Battle', 'Targeted Assassination', 'Air Strike', 'Border Skirmish'))
      or (category = 'Political Tension' and subtype in ('Protest', 'Legislation Dispute', 'Government Crisis'))
      or (category = 'Natural Disaster' and subtype in ('Earthquake', 'Flood', 'Cyclone', 'Drought', 'Wildfire'))
      or (category = 'Humanitarian Crisis' and subtype in ('Food Crisis', 'Population Displacement', 'Flood', 'Drought', 'Disease Outbreak'))
    )
  );

comment on constraint events_category_subtype_valid on public.events is 'Valid category/subtype pairs including Humanitarian Crisis for ReliefWeb mapping.';
