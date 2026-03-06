-- Phase 5D: Email notifications for watchlists.
-- When an alert is created and the watchlist has email_notifications true, send email.

alter table public.user_watchlists
  add column if not exists email_notifications boolean not null default false;

comment on column public.user_watchlists.email_notifications is 'When true, send email when a new alert is created for this watchlist.';
