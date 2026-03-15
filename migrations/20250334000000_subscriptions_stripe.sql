-- Stripe subscriptions: link Supabase user to Stripe customer and subscription.

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_subscriptions_stripe_customer_id on public.subscriptions (stripe_customer_id) where stripe_customer_id is not null;

comment on table public.subscriptions is 'Stripe customer and subscription per user for Pro/Enterprise checkout.';

alter table public.subscriptions enable row level security;

create policy subscriptions_select_own on public.subscriptions
  for select using (auth.uid() = user_id);

create policy subscriptions_insert_system on public.subscriptions
  for insert with check (true);

create policy subscriptions_update_system on public.subscriptions
  for update using (true);
