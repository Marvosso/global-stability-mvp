-- Migration: add indexes for events table usage (status, tier, created_at, reviewer queries)
-- Do not modify application logic.

-- =========================================================
-- EVENTS: status and ordering
-- =========================================================

create index idx_events_status
on public.events (status);

create index idx_events_status_created_at_id
on public.events (status, created_at asc, id asc);

create index idx_events_status_updated_at_desc
on public.events (status, updated_at desc);

create index idx_events_created_at
on public.events (created_at desc);

-- =========================================================
-- TIER: sources and event_sources (tier to event ids)
-- =========================================================

create index idx_sources_reliability_tier
on public.sources (reliability_tier);

create index idx_event_sources_source_id_event_id
on public.event_sources (source_id, event_id);

-- =========================================================
-- REVIEWER: optional (created_by / last_reviewed_by)
-- =========================================================

create index idx_events_created_by_status
on public.events (created_by, status)
where created_by is not null;

create index idx_events_last_reviewed_by_status
on public.events (last_reviewed_by, status)
where last_reviewed_by is not null;
