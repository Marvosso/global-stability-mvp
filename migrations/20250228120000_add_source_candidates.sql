-- Migration: add source_candidates and source_candidate_audit_log for intake pipeline
-- No external ingestion; candidates are inserted by other means (manual or future job).

-- =========================================================
-- ENUM: source_candidate_status
-- =========================================================

create type source_candidate_status as enum (
  'Pending',
  'Approved',
  'Rejected'
);

-- =========================================================
-- TABLE: source_candidates
-- =========================================================

create table public.source_candidates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_type source_type not null,
  url text,
  ecosystem_key text,
  reliability_tier reliability_tier,
  status source_candidate_status not null default 'Pending',
  reviewed_at timestamptz,
  reviewed_by text,
  promoted_to_source_id uuid references public.sources (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_source_candidates_status
on public.source_candidates (status);

create trigger set_timestamp_source_candidates
before update on public.source_candidates
for each row
execute function public.set_updated_at();

-- =========================================================
-- TABLE: source_candidate_audit_log
-- =========================================================

create table public.source_candidate_audit_log (
  id uuid primary key default gen_random_uuid(),
  source_candidate_id uuid not null references public.source_candidates (id) on delete cascade,
  action text not null,
  actor_id text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index idx_source_candidate_audit_log_candidate_id
on public.source_candidate_audit_log (source_candidate_id);
