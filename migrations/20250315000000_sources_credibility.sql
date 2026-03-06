-- Phase 12D: Source credibility scoring for confidence engine.
-- Extend sources with metrics used when computing event confidence.

alter table public.sources
  add column if not exists accuracy_score numeric,
  add column if not exists corroboration_rate numeric,
  add column if not exists citation_count integer default 0;

comment on column public.sources.accuracy_score is 'Historical accuracy 0-100; used in confidence calculation.';
comment on column public.sources.corroboration_rate is 'Rate of reports corroborated by others 0-1; used in confidence calculation.';
comment on column public.sources.citation_count is 'Number of times this source has been cited on events; used in confidence calculation.';

-- Optional: constraint to keep rates in range (can be added later)
-- alter table public.sources add constraint chk_accuracy_score check (accuracy_score is null or (accuracy_score >= 0 and accuracy_score <= 100));
-- alter table public.sources add constraint chk_corroboration_rate check (corroboration_rate is null or (corroboration_rate >= 0 and corroboration_rate <= 1));

-- Increment source citation count when attached to an event.
create or replace function public.increment_source_citation_count(p_source_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update sources set citation_count = coalesce(citation_count, 0) + 1 where id = p_source_id;
$$;
