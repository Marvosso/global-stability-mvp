-- Option A1: suggested_reliability_tier (match sources), unique(url) to prevent duplicate candidates.
-- Run after 20250228150000_option_a_source_candidates.sql (drops and recreates).

drop table if exists public.source_candidate_audit_log;
drop table if exists public.source_candidates;

create table public.source_candidates (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  domain text not null,
  name_guess text,
  suggested_reliability_tier reliability_tier,
  suggested_ecosystem text,
  evidence_excerpt text,
  discovered_from_event_id uuid references public.events (id) on delete set null,
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected')),
  reviewed_at timestamptz,
  reviewed_by text,
  promoted_to_source_id uuid references public.sources (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint source_candidates_url_unique unique (url)
);

create index idx_source_candidates_status_created_at
on public.source_candidates (status, created_at desc);

create index idx_source_candidates_domain
on public.source_candidates (domain);

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
