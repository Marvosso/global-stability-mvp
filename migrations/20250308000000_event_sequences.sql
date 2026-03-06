-- Phase 8: Scenario Analysis Engine – event_sequences and events.outcome.
-- Stores aggregated outcome counts per (category, subtype, severity) for scenario probabilities.

create table public.event_sequences (
  id uuid primary key default gen_random_uuid(),
  sequence_key text not null,
  category text not null,
  subtype text,
  severity_pattern text not null,
  outcome text not null,
  count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_sequences_sequence_outcome_unique unique (sequence_key, outcome)
);

comment on table public.event_sequences is 'Aggregated outcome counts per event pattern for scenario analysis.';
comment on column public.event_sequences.sequence_key is 'Pattern key e.g. Political Tension|Protest|High.';
comment on column public.event_sequences.outcome is 'e.g. Regional escalation, Localized conflict, De-escalation.';

create index idx_event_sequences_sequence_key on public.event_sequences (sequence_key);

alter table public.event_sequences enable row level security;

create policy event_sequences_select_all on public.event_sequences
  for select using (true);

create policy event_sequences_insert_system on public.event_sequences
  for insert with check (true);

create policy event_sequences_update_system on public.event_sequences
  for update using (true);

-- Optional outcome on events for populating event_sequences (manual or backfill).
alter table public.events
  add column if not exists outcome text;

comment on column public.events.outcome is 'Scenario outcome e.g. Regional escalation; used to update event_sequences.';
