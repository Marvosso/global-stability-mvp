-- Phase 12A: AI context draft storage.
-- Stores LLM-generated context drafts per event; does not overwrite event_context.

create table public.event_context_drafts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  draft_summary text,
  draft_trigger text,
  draft_background text,
  model text not null,
  created_at timestamptz not null default now()
);

comment on table public.event_context_drafts is 'AI-generated context drafts; reviewer may apply to event_context.';
comment on column public.event_context_drafts.draft_summary is 'One-paragraph summary from LLM.';
comment on column public.event_context_drafts.draft_trigger is 'Trigger or precipitating factor from LLM.';
comment on column public.event_context_drafts.draft_background is 'Background narrative from LLM.';
comment on column public.event_context_drafts.model is 'Model identifier used for generation (e.g. gpt-4o-mini).';

create index idx_event_context_drafts_event_id
  on public.event_context_drafts (event_id);

alter table public.event_context_drafts enable row level security;

create policy event_context_drafts_select_all on public.event_context_drafts
  for select using (true);

create policy event_context_drafts_insert_system on public.event_context_drafts
  for insert with check (true);

create policy event_context_drafts_update_system on public.event_context_drafts
  for update using (true);

create policy event_context_drafts_delete_system on public.event_context_drafts
  for delete using (true);
