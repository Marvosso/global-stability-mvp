-- Phase 10A: Region stability score tables.
-- Daily stability score per region (e.g. country) with optional component breakdown.

create table public.region_scores (
  id uuid primary key default gen_random_uuid(),
  region_type text not null,
  region_code text not null,
  as_of_date date not null,
  stability_score numeric not null,
  delta_24h numeric,
  delta_7d numeric,
  computed_at timestamptz not null default now(),
  constraint region_scores_region_date_unique unique (region_type, region_code, as_of_date)
);

create index idx_region_scores_region_latest
  on public.region_scores (region_type, region_code, as_of_date desc);

create table public.score_components (
  id uuid primary key default gen_random_uuid(),
  region_score_id uuid not null references public.region_scores (id) on delete cascade,
  component text not null,
  value numeric not null,
  weight numeric,
  notes text
);

create index idx_score_components_region_score_id
  on public.score_components (region_score_id);

alter table public.region_scores enable row level security;

create policy region_scores_select_all on public.region_scores
  for select using (true);

create policy region_scores_insert_system on public.region_scores
  for insert with check (true);

create policy region_scores_update_system on public.region_scores
  for update using (true);

alter table public.score_components enable row level security;

create policy score_components_select_all on public.score_components
  for select using (true);

create policy score_components_insert_system on public.score_components
  for insert with check (true);

create policy score_components_update_system on public.score_components
  for update using (true);

create policy score_components_delete_system on public.score_components
  for delete using (true);
