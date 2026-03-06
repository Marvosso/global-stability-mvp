-- Phase 2C: trusted_domains schema — domain, default_reliability_tier, is_enabled, notes.
-- Run after 20250229000000_trusted_domains.sql (and seed if present).

-- Add new columns
alter table public.trusted_domains
  add column if not exists is_enabled boolean not null default true,
  add column if not exists notes text,
  add column if not exists default_reliability_tier reliability_tier;

-- Backfill from existing columns
update public.trusted_domains
set
  default_reliability_tier = reliability_tier,
  is_enabled = auto_approve,
  notes = null
where default_reliability_tier is null;

-- Ensure not null for default_reliability_tier (after backfill)
alter table public.trusted_domains
  alter column default_reliability_tier set not null;

-- Drop old columns
alter table public.trusted_domains
  drop column if exists source_name,
  drop column if exists source_type,
  drop column if exists reliability_tier,
  drop column if exists ecosystem_key,
  drop column if exists auto_approve;
