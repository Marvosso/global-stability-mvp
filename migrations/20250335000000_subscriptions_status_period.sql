-- Add status and current_period_end to subscriptions for webhook handling.

alter table public.subscriptions
  add column if not exists status text,
  add column if not exists current_period_end timestamptz;

comment on column public.subscriptions.status is 'Stripe subscription status: active, canceled, past_due, etc.';
comment on column public.subscriptions.current_period_end is 'Stripe subscription current_period_end for renewal tracking.';
