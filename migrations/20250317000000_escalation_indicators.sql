-- Phase 14A: Escalation indicator system.
-- Stores detected escalation indicators per region (protest spikes, conflict escalation, etc.).

create table public.escalation_indicators (
  id uuid primary key default gen_random_uuid(),
  region_code text not null,
  indicator_type text not null,
  score numeric,
  description text,
  detected_at timestamptz not null default now(),
  constraint escalation_indicators_type_check check (
    indicator_type in (
      'protest_spike',
      'conflict_escalation',
      'humanitarian_deterioration',
      'disaster_spillover',
      'cross_border_incident'
    )
  )
);

comment on table public.escalation_indicators is 'Detected escalation indicators per region (protest spikes, conflict escalation, etc.).';
comment on column public.escalation_indicators.region_code is 'ISO country code or region key (e.g. from region_scores).';
comment on column public.escalation_indicators.indicator_type is 'Type of indicator: protest_spike, conflict_escalation, humanitarian_deterioration, disaster_spillover, cross_border_incident.';
comment on column public.escalation_indicators.score is 'Severity or confidence score for the indicator (optional).';
comment on column public.escalation_indicators.description is 'Human-readable explanation of the indicator.';
comment on column public.escalation_indicators.detected_at is 'When the indicator was detected.';

create index idx_escalation_indicators_region_code
  on public.escalation_indicators (region_code);

create index idx_escalation_indicators_detected_at
  on public.escalation_indicators (detected_at desc);

alter table public.escalation_indicators enable row level security;

create policy escalation_indicators_select_all on public.escalation_indicators
  for select using (true);

create policy escalation_indicators_insert_system on public.escalation_indicators
  for insert with check (true);

create policy escalation_indicators_update_system on public.escalation_indicators
  for update using (true);

create policy escalation_indicators_delete_system on public.escalation_indicators
  for delete using (true);
