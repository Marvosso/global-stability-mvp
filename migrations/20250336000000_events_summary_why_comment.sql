-- Document summary as the "why" explanation field. Column already exists; allow NULL for flexibility.
alter table public.events alter column summary drop not null;
comment on column public.events.summary is 'Why/what happened: official report (USGS/GDACS/ACLED), GDELT context, or manual explanation.';
