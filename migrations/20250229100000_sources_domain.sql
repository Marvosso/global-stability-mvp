-- Add sources.domain for eTLD+1 matching (subdomain dedupe).
-- Run after sources table exists.
-- Backfill: run `npx tsx scripts/backfill_sources_domain.ts` after applying.

alter table public.sources
  add column if not exists domain text;

-- Unique index: one source per domain (allows multiple nulls).
-- Apply after backfill; if backfill not run, all domains stay null.
create unique index if not exists idx_sources_domain_unique
  on public.sources (domain)
  where domain is not null;
