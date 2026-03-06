-- Phase 12C: Claim contradiction detection.
-- Stores AI-detected contradicting claim pairs per event.

create table public.claim_conflicts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  claim_a_id uuid not null references public.event_claims (id) on delete cascade,
  claim_b_id uuid not null references public.event_claims (id) on delete cascade,
  conflict_score numeric not null,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint claim_conflicts_ordered check (claim_a_id < claim_b_id),
  constraint claim_conflicts_unique_pair unique (claim_a_id, claim_b_id)
);

comment on table public.claim_conflicts is 'AI-detected contradicting claim pairs; event page shows warning.';
comment on column public.claim_conflicts.conflict_score is '0-1 score; higher = stronger contradiction.';
comment on column public.claim_conflicts.reason is 'Short explanation of the contradiction.';

create index idx_claim_conflicts_event_id on public.claim_conflicts (event_id);

alter table public.claim_conflicts enable row level security;

create policy claim_conflicts_select_all on public.claim_conflicts
  for select using (true);

create policy claim_conflicts_insert_system on public.claim_conflicts
  for insert with check (true);

create policy claim_conflicts_delete_system on public.claim_conflicts
  for delete using (true);
