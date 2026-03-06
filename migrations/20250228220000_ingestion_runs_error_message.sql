-- Add error_message to ingestion_runs for last-error display on admin page.
alter table public.ingestion_runs
  add column if not exists error_message text;
