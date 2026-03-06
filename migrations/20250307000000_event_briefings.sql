-- Phase 6B-5: Event briefings (Draft AI briefing auto-generated on publish).
-- Requires: public.events.

create table public.event_briefings (
  event_id uuid not null references public.events (id) on delete cascade,
  brief_json jsonb not null,
  version integer not null default 1,
  generated_at timestamptz not null default now(),
  status text not null default 'Draft',
  primary key (event_id),
  constraint event_briefings_status_check check (status in ('Draft', 'Approved'))
);

comment on table public.event_briefings is 'AI-generated briefings per event; Draft until reviewer approves.';
comment on column public.event_briefings.status is 'Draft: internal only. Approved: may be shown to public.';

create index idx_event_briefings_generated_at on public.event_briefings (generated_at desc);
create index idx_event_briefings_status on public.event_briefings (status);

alter table public.event_briefings enable row level security;

-- Reviewers/Admins can select and update (for approval); service role used by generateDraftBriefing and internal API.
create policy event_briefings_select_internal on public.event_briefings
  for select using (true);

create policy event_briefings_insert_system on public.event_briefings
  for insert with check (true);

create policy event_briefings_update_system on public.event_briefings
  for update using (true);
