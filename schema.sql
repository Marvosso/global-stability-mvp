-- Global Stability MVP Supabase/Postgres schema
-- Generated from supabase-schema-global-stability plan.

-- =========================================================
-- ENUM TYPES (from taxonomy_actors.json)
-- =========================================================

create type event_category as enum (
  'Armed Conflict',
  'Political Tension',
  'Military Posture',
  'Diplomatic Confrontation',
  'Coercive Economic Action',
  'Natural Disaster'
);

create type event_subtype as enum (
  'Battle',
  'Targeted Assassination',
  'Air Strike',
  'Border Skirmish',
  'Protest',
  'Legislation Dispute',
  'Government Crisis',
  'Earthquake',
  'Flood',
  'Cyclone',
  'Drought'
);

create type primary_classification as enum (
  'Verified Event',
  'Disputed Claim'
);

create type secondary_classification as enum (
  'Official Claim',
  'Opposition Claim'
);

create type actor_type as enum (
  'National Government',
  'Armed Non-State Group',
  'International Organization'
);

create type actor_alignment as enum (
  'State',
  'Non-State',
  'Unknown'
);

-- =========================================================
-- ADDITIONAL ENUM TYPES (non-taxonomy)
-- =========================================================

create type severity_level as enum (
  'Low',
  'Medium',
  'High',
  'Critical'
);

create type confidence_level as enum (
  'Low',
  'Medium',
  'High'
);

create type event_status as enum (
  'Draft',
  'UnderReview',
  'Published',
  'Rejected'
);

create type actor_role as enum (
  'Initiator',
  'Target',
  'Mediator',
  'Observer'
);

create type source_type as enum (
  'Official',
  'Media',
  'NGO',
  'SocialMedia',
  'Other'
);

create type reliability_tier as enum (
  'Low',
  'Medium',
  'High'
);

create type audit_changed_field as enum (
  'primary_classification',
  'secondary_classification',
  'severity',
  'confidence_level',
  'confidence_score'
);

create type audit_origin as enum (
  'HumanReview',
  'SystemRule',
  'Ingestion',
  'ManualOverride'
);

create type event_linkage_type as enum (
  'Causal',
  'FollowOn',
  'SharedActor',
  'Duplicate',
  'Supersedes'
);

-- =========================================================
-- TABLE: actors
-- =========================================================

create table public.actors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  canonical_name text,
  actor_type actor_type not null,
  alignment actor_alignment not null,
  affiliation_label text not null,
  affiliated_to_actor_id uuid references public.actors (id) on delete set null,
  country_code text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- TABLE: events
-- =========================================================

create table public.events (
  id uuid primary key default gen_random_uuid(),

  -- Core descriptors
  title text not null,
  summary text not null,
  details text,

  -- Taxonomy / classification
  category event_category not null,
  subtype event_subtype,
  primary_classification primary_classification not null,
  secondary_classification secondary_classification,

  -- Severity & confidence
  severity severity_level not null,
  confidence_level confidence_level not null,
  confidence_score numeric(5,2),

  -- Governance / workflow
  status event_status not null default 'Draft',
  created_by uuid,
  last_reviewed_by uuid,
  requires_dual_review boolean not null default false,

  -- Temporal & location context
  occurred_at timestamptz,
  ended_at timestamptz,
  primary_location text,

  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint events_category_subtype_valid
    check (
      subtype is null
      or (
        (category = 'Armed Conflict' and subtype in ('Battle', 'Targeted Assassination', 'Air Strike', 'Border Skirmish'))
        or (category = 'Political Tension' and subtype in ('Protest', 'Legislation Dispute', 'Government Crisis'))
        or (category = 'Natural Disaster' and subtype in ('Earthquake', 'Flood', 'Cyclone', 'Drought'))
      )
    )
);

-- =========================================================
-- TABLE: event_actors (junction)
-- =========================================================

create table public.event_actors (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  actor_id uuid not null references public.actors (id) on delete restrict,
  role actor_role not null,
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint event_actors_unique_participation unique (event_id, actor_id, role)
);

-- =========================================================
-- TABLE: sources
-- =========================================================

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_type source_type not null,
  url text,
  domain text,  -- eTLD+1 for subdomain dedupe (see migration 20250229100000)
  ecosystem_key text,
  reliability_tier reliability_tier,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- TABLE: event_sources (junction)
-- =========================================================

create table public.event_sources (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  source_id uuid not null references public.sources (id) on delete restrict,

  claim_url text,
  claim_timestamp timestamptz,
  source_primary_classification primary_classification,
  source_secondary_classification secondary_classification,
  source_confidence_level confidence_level,
  raw_excerpt text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint event_sources_unique_pair unique (event_id, source_id)
);

-- =========================================================
-- TABLE: confidence_audit_log
-- =========================================================

create table public.confidence_audit_log (
  id uuid primary key default gen_random_uuid(),

  event_id uuid not null references public.events (id) on delete cascade,

  changed_field audit_changed_field not null,
  old_value text,
  new_value text not null,

  justification text not null,
  changed_by uuid,
  change_origin audit_origin not null,

  changed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- =========================================================
-- TABLE: event_linkages
-- =========================================================

create table public.event_linkages (
  id uuid primary key default gen_random_uuid(),

  from_event_id uuid not null references public.events (id) on delete cascade,
  to_event_id uuid not null references public.events (id) on delete cascade,

  linkage_type event_linkage_type not null,
  linkage_confidence_level confidence_level not null,
  description text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint event_linkages_no_self_link check (from_event_id <> to_event_id),
  constraint event_linkages_unique_edge unique (from_event_id, to_event_id, linkage_type)
);

-- =========================================================
-- TIMESTAMP MAINTENANCE TRIGGERS
-- =========================================================

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_timestamp_actors
before update on public.actors
for each row
execute function public.set_updated_at();

create trigger set_timestamp_events
before update on public.events
for each row
execute function public.set_updated_at();

create trigger set_timestamp_event_actors
before update on public.event_actors
for each row
execute function public.set_updated_at();

create trigger set_timestamp_sources
before update on public.sources
for each row
execute function public.set_updated_at();

create trigger set_timestamp_event_sources
before update on public.event_sources
for each row
execute function public.set_updated_at();

create trigger set_timestamp_event_linkages
before update on public.event_linkages
for each row
execute function public.set_updated_at();

-- =========================================================
-- AUDIT TRIGGER FOR events (classification / severity / confidence)
-- =========================================================

create or replace function public.log_event_confidence_change()
returns trigger as $$
declare
  v_justification text;
  v_changed_by text;
begin
  -- Expect justification and (optionally) changed_by to be provided
  -- via session settings set by the application:
  --   select set_config('audit.justification', 'reason...', true);
  --   select set_config('audit.changed_by', '<uuid>', true);

  v_justification := current_setting('audit.justification', true);
  if v_justification is null or length(trim(v_justification)) = 0 then
    raise exception 'audit.justification setting must be provided for classification/severity/confidence changes';
  end if;

  v_changed_by := current_setting('audit.changed_by', true);

  if new.primary_classification is distinct from old.primary_classification then
    insert into public.confidence_audit_log (
      event_id,
      changed_field,
      old_value,
      new_value,
      justification,
      changed_by,
      change_origin
    ) values (
      new.id,
      'primary_classification',
      old.primary_classification::text,
      new.primary_classification::text,
      v_justification,
      nullif(v_changed_by, '')::uuid,
      'HumanReview'
    );
  end if;

  if new.secondary_classification is distinct from old.secondary_classification then
    insert into public.confidence_audit_log (
      event_id,
      changed_field,
      old_value,
      new_value,
      justification,
      changed_by,
      change_origin
    ) values (
      new.id,
      'secondary_classification',
      old.secondary_classification::text,
      new.secondary_classification::text,
      v_justification,
      nullif(v_changed_by, '')::uuid,
      'HumanReview'
    );
  end if;

  if new.severity is distinct from old.severity then
    insert into public.confidence_audit_log (
      event_id,
      changed_field,
      old_value,
      new_value,
      justification,
      changed_by,
      change_origin
    ) values (
      new.id,
      'severity',
      old.severity::text,
      new.severity::text,
      v_justification,
      nullif(v_changed_by, '')::uuid,
      'HumanReview'
    );
  end if;

  if new.confidence_level is distinct from old.confidence_level then
    insert into public.confidence_audit_log (
      event_id,
      changed_field,
      old_value,
      new_value,
      justification,
      changed_by,
      change_origin
    ) values (
      new.id,
      'confidence_level',
      old.confidence_level::text,
      new.confidence_level::text,
      v_justification,
      nullif(v_changed_by, '')::uuid,
      'HumanReview'
    );
  end if;

  if new.confidence_score is distinct from old.confidence_score then
    insert into public.confidence_audit_log (
      event_id,
      changed_field,
      old_value,
      new_value,
      justification,
      changed_by,
      change_origin
    ) values (
      new.id,
      'confidence_score',
      old.confidence_score::text,
      new.confidence_score::text,
      v_justification,
      nullif(v_changed_by, '')::uuid,
      'HumanReview'
    );
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_log_event_confidence_change
before update of primary_classification,
               secondary_classification,
               severity,
               confidence_level,
               confidence_score
on public.events
for each row
when (
  new.primary_classification is distinct from old.primary_classification or
  new.secondary_classification is distinct from old.secondary_classification or
  new.severity is distinct from old.severity or
  new.confidence_level is distinct from old.confidence_level or
  new.confidence_score is distinct from old.confidence_score
)
execute function public.log_event_confidence_change();

-- =========================================================
-- RPC: update_event_confidence (sets audit context then updates)
-- =========================================================

create or replace function public.update_event_confidence(
  p_event_id uuid,
  p_confidence_score numeric,
  p_confidence_level confidence_level,
  p_justification text,
  p_changed_by uuid default null
)
returns setof public.events
language plpgsql
security definer
as $$
begin
  perform set_config('audit.justification', coalesce(trim(p_justification), 'Confidence recalculated'), true);
  perform set_config('audit.changed_by', coalesce(p_changed_by::text, ''), true);
  return query
  update public.events
  set confidence_score = p_confidence_score,
      confidence_level = p_confidence_level
  where id = p_event_id
  returning *;
end;
$$;
