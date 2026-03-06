-- Migration: ensure source_candidates has domain column and unique-by-domain semantics
-- - Adds domain column if missing (for older schemas)
-- - Replaces any existing non-unique domain index with a partial UNIQUE index
--   so there is at most one candidate row per non-null domain.

alter table public.source_candidates
  add column if not exists domain text;

-- Drop old non-unique index if it exists, then create a partial unique index.
drop index if exists public.idx_source_candidates_domain;

create unique index idx_source_candidates_domain_unique
on public.source_candidates (domain)
where domain is not null;

