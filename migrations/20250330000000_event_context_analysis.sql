-- Context Analysis layer: add columns to event_context for summary, significance, driver, uncertainty.
-- Keeps existing one_paragraph_summary, background, trigger for backward compatibility.

alter table public.event_context
  add column if not exists summary text,
  add column if not exists why_it_matters text,
  add column if not exists likely_driver text,
  add column if not exists uncertainty_note text,
  add column if not exists generated_by text,
  add column if not exists status text not null default 'Draft',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz;

alter table public.event_context
  drop constraint if exists event_context_status_check;

alter table public.event_context
  add constraint event_context_status_check check (status in ('Draft', 'Approved', 'Rejected'));

create index if not exists idx_event_context_status on public.event_context (status);
create index if not exists idx_event_context_updated_at on public.event_context (updated_at);

comment on column public.event_context.summary is 'Concise restatement of what happened (context analysis).';
comment on column public.event_context.why_it_matters is 'Likely significance for regional stability or humanitarian impact.';
comment on column public.event_context.likely_driver is 'Conservative inferred driver from category and nearby events.';
comment on column public.event_context.uncertainty_note is 'Note on confidence and corroboration.';
comment on column public.event_context.generated_by is 'Generator identifier (e.g. deterministic-v1 or model name).';
comment on column public.event_context.status is 'Draft, Approved, or Rejected.';
comment on column public.event_context.reviewed_by is 'User who approved or rejected the context.';
comment on column public.event_context.reviewed_at is 'When the context was reviewed.';
