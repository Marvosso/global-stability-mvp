-- Trusted domains for source auto-approval.
-- Run after core enum and sources/source_candidates tables exist.

create table public.trusted_domains (
  domain text primary key, -- normalized eTLD+1 (e.g. usgs.gov)
  source_name text not null,
  source_type source_type not null,
  reliability_tier reliability_tier not null,
  ecosystem_key text,
  auto_approve boolean not null default true,
  created_at timestamptz not null default now()
);

