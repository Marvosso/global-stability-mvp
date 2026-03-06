-- Phase 12B: AI-extracted claim candidates for reviewer approval.
-- Approve moves to event_claims; reject discards.

create table public.event_claim_candidates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  event_source_id uuid references public.event_sources (id) on delete set null,

  claim_text text not null,
  claim_type text,
  actor_name text,
  classification text,
  confidence_level text,
  evidence_source_url text,
  source_name text,
  model text not null,
  created_at timestamptz not null default now()
);

comment on table public.event_claim_candidates is 'AI-suggested claims; reviewer approves to event_claims or rejects.';
comment on column public.event_claim_candidates.event_source_id is 'Link to event_sources when extracted from a linked source.';
comment on column public.event_claim_candidates.evidence_source_url is 'URL for evidence when promoting to event_claims.';
comment on column public.event_claim_candidates.source_name is 'Display name of the source.';
comment on column public.event_claim_candidates.model is 'LLM identifier used for extraction.';

create index idx_event_claim_candidates_event_id_created_at
  on public.event_claim_candidates (event_id, created_at);

alter table public.event_claim_candidates enable row level security;

create policy event_claim_candidates_select_all on public.event_claim_candidates
  for select using (true);

create policy event_claim_candidates_insert_system on public.event_claim_candidates
  for insert with check (true);

create policy event_claim_candidates_update_system on public.event_claim_candidates
  for update using (true);

create policy event_claim_candidates_delete_system on public.event_claim_candidates
  for delete using (true);
