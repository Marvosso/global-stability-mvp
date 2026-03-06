-- Add match_score and suggested_incident_id for weighted incident clustering.
-- match_score: stored when incident_id is assigned (audit) or when suggested (0.50-0.74).
-- suggested_incident_id: set when score 0.50-0.74; incident_id remains null for review.

alter table public.events
  add column if not exists match_score numeric,
  add column if not exists suggested_incident_id uuid references public.incidents (id) on delete set null;

create index if not exists events_suggested_incident_id_idx on public.events (suggested_incident_id);

comment on column public.events.match_score is 'Similarity score when incident_id or suggested_incident_id is set.';
comment on column public.events.suggested_incident_id is 'Possible match for review when score 0.50-0.74; incident_id remains null.';
