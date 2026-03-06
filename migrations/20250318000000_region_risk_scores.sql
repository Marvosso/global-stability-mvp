-- Phase 14C: Region escalation risk scores.
-- One row per region with computed risk_score and risk_level from escalation_indicators.

create table public.region_risk_scores (
  id uuid primary key default gen_random_uuid(),
  region_code text not null unique,
  risk_score numeric not null,
  risk_level text not null,
  computed_at timestamptz not null default now(),
  constraint region_risk_scores_risk_level_check check (
    risk_level in ('Low', 'Medium', 'High', 'Critical')
  )
);

comment on table public.region_risk_scores is 'Computed escalation risk per region from escalation_indicators (weighted aggregate).';
comment on column public.region_risk_scores.region_code is 'ISO country code or region key.';
comment on column public.region_risk_scores.risk_score is 'Weighted sum of indicator scores (0-100 scale).';
comment on column public.region_risk_scores.risk_level is 'Derived level: Low, Medium, High, Critical.';
comment on column public.region_risk_scores.computed_at is 'When the score was computed.';

create index idx_region_risk_scores_region_code
  on public.region_risk_scores (region_code);

create index idx_region_risk_scores_computed_at
  on public.region_risk_scores (computed_at desc);

alter table public.region_risk_scores enable row level security;

create policy region_risk_scores_select_all on public.region_risk_scores
  for select using (true);

create policy region_risk_scores_insert_system on public.region_risk_scores
  for insert with check (true);

create policy region_risk_scores_update_system on public.region_risk_scores
  for update using (true);

create policy region_risk_scores_delete_system on public.region_risk_scores
  for delete using (true);
