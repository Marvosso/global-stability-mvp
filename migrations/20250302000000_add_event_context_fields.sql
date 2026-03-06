-- Migration: add optional context fields to public.events for narrative background,
-- key parties, and competing claims (Phase 4C).

alter table public.events
  add column if not exists context_background text;

alter table public.events
  add column if not exists key_parties text;

alter table public.events
  add column if not exists competing_claims jsonb;

comment on column public.events.context_background is 'Background narrative shown to public users.';
comment on column public.events.key_parties is 'Key actors or coalitions.';
comment on column public.events.competing_claims is 'Array of { claim, attributed_to, confidence } for competing claims.';
