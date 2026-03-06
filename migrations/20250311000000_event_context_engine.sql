-- Phase 11A: Context Engine tables.
-- Structured context per event: one summary row, multiple claims and facts.
-- Requires: public.events.

create table public.event_context (
  event_id uuid not null references public.events (id) on delete cascade,
  one_paragraph_summary text,
  background text,
  trigger text,
  updated_at timestamptz not null default now(),
  primary key (event_id)
);

comment on table public.event_context is 'Structured context per event: summary, background, trigger (one row per event).';
comment on column public.event_context.one_paragraph_summary is 'Single-paragraph summary of the event.';
comment on column public.event_context.background is 'Narrative background.';
comment on column public.event_context.trigger is 'What triggered or precipitated the event.';

create table public.event_claims (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  claim_text text not null,
  claim_type text,
  actor_name text,
  classification text,
  evidence_source_url text,
  confidence_level text,
  created_at timestamptz not null default now()
);

comment on table public.event_claims is 'Claims associated with an event (e.g. competing narratives, attributions).';
comment on column public.event_claims.claim_type is 'Type of claim (e.g. attribution, denial).';
comment on column public.event_claims.actor_name is 'Actor or party making or associated with the claim.';
comment on column public.event_claims.classification is 'Classification of the claim (e.g. verified, disputed).';
comment on column public.event_claims.confidence_level is 'Confidence in the claim or its attribution.';

create index idx_event_claims_event_id_created_at
  on public.event_claims (event_id, created_at);

create table public.event_facts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  fact_text text not null,
  evidence_source_url text,
  confidence_level text,
  created_at timestamptz not null default now()
);

comment on table public.event_facts is 'Verified or asserted facts associated with an event.';
comment on column public.event_facts.confidence_level is 'Confidence in the fact or its source.';

create index idx_event_facts_event_id_created_at
  on public.event_facts (event_id, created_at);

alter table public.event_context enable row level security;

create policy event_context_select_all on public.event_context
  for select using (true);

create policy event_context_insert_system on public.event_context
  for insert with check (true);

create policy event_context_update_system on public.event_context
  for update using (true);

alter table public.event_claims enable row level security;

create policy event_claims_select_all on public.event_claims
  for select using (true);

create policy event_claims_insert_system on public.event_claims
  for insert with check (true);

create policy event_claims_update_system on public.event_claims
  for update using (true);

create policy event_claims_delete_system on public.event_claims
  for delete using (true);

alter table public.event_facts enable row level security;

create policy event_facts_select_all on public.event_facts
  for select using (true);

create policy event_facts_insert_system on public.event_facts
  for insert with check (true);

create policy event_facts_update_system on public.event_facts
  for update using (true);

create policy event_facts_delete_system on public.event_facts
  for delete using (true);
