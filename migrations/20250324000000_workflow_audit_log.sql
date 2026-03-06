-- Workflow audit log for event status transitions (draft_created, approved, rejected, confidence_updated, auto_published).
create table if not exists public.workflow_audit_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  action text not null,
  actor_id uuid references auth.users (id) on delete set null,
  actor_role text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index idx_workflow_audit_log_event_id on public.workflow_audit_log (event_id);
create index idx_workflow_audit_log_action on public.workflow_audit_log (action);
create index idx_workflow_audit_log_created_at on public.workflow_audit_log (created_at desc);

comment on table public.workflow_audit_log is 'Audit trail for event workflow actions: draft_created, approved, rejected, confidence_updated, auto_published';
