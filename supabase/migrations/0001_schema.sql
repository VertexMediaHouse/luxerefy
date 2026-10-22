-- Core schema for luxerefy CRM. Mirrors src/lib/types.ts 1:1 (see that file's header comment).
-- Design notes, ERD and rationale: supabase/schema.md

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists btree_gist; -- EXCLUDE constraint on tasks

-- ── enums ─────────────────────────────────────────────────────────────────
create type role_t              as enum ('owner', 'manager', 'agent');
create type tone_t              as enum ('slate', 'blue', 'violet', 'amber', 'green', 'red');
create type stage_kind_t        as enum ('entry', 'open', 'won', 'lost');
create type contact_kind_t      as enum ('client', 'lead', 'vendor');
create type lead_source_t       as enum ('99acres', 'social_media', 'website', 'property_page', 'referral', 'walk_in', 'other');
create type activity_type_t     as enum ('created', 'enquiry', 'call', 'text', 'note', 'status_change', 'assignment', 'follow_up');
create type property_segment_t  as enum ('residential', 'commercial');
create type property_category_t as enum ('apartment', 'plot', 'bungalow', 'weekend_villa', 'weekend_plot');
create type property_status_t   as enum ('available', 'reserved', 'sold', 'off_market');
create type task_kind_t         as enum ('call', 'text', 'follow_up', 'site_visit', 'meeting', 'documents', 'approval', 'other');
create type task_status_t       as enum ('pending', 'done', 'cancelled');
create type ticket_status_t     as enum ('pending', 'in_progress', 'resolved');
create type ticket_priority_t   as enum ('low', 'normal', 'high', 'urgent');
create type goal_period_t       as enum ('weekly', 'monthly', 'yearly');
create type goal_metric_t       as enum ('leads', 'won', 'revenue', 'site_visits');
create type doc_folder_t        as enum ('Company Brochures', 'General Documents', 'Agreements', 'KYC', 'Other');

-- ── profiles ──────────────────────────────────────────────────────────────
-- One row per auth.users row (trigger in 0002 keeps them in sync).
create table profiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email     text not null unique,
  phone     text not null default '',
  role      role_t not null default 'agent',
  active    boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── pipelines / stages ───────────────────────────────────────────────────
-- ids are slugs, not uuids: stage ids are derived as `${pipeline_id}-new|-won|-lost`
-- (see rules.ts: entryOf/wonOf/lostOf), which is what lets the app test "is this stage
-- terminal" from the id alone, with no join. The CHECK below enforces that convention
-- for the three reserved kinds; a manager-added 'open' stage can use any id.
create table pipelines (
  id         text primary key,
  name       text not null,
  position   int not null unique,
  created_at timestamptz not null default now()
);

create table stages (
  id         text primary key,
  pipeline_id text not null references pipelines(id) on delete cascade,
  label      text not null,
  tone       tone_t not null default 'slate',
  position   int not null,
  kind       stage_kind_t not null,
  unique (pipeline_id, position),
  constraint stage_id_matches_kind check (
    (kind = 'entry' and id = pipeline_id || '-new') or
    (kind = 'won'   and id = pipeline_id || '-won') or
    (kind = 'lost'  and id = pipeline_id || '-lost') or
    (kind = 'open')
  )
);

-- ── contacts ──────────────────────────────────────────────────────────────
create table contacts (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text not null unique,
  email      text,
  kind       contact_kind_t not null default 'lead',
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  -- normalize_phone() in 0002 is the only writer; this is the shape it produces.
  constraint contact_phone_e164 check (phone ~ '^\+[1-9][0-9]{6,14}$')
);

-- ── properties ────────────────────────────────────────────────────────────
create table properties (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  title       text not null,
  project     text not null,
  config      text not null,
  area_sqft   numeric(10,2) not null check (area_sqft > 0),
  price       numeric(14,2) not null check (price >= 0),
  segment     property_segment_t not null,
  category    property_category_t not null,
  locality    text not null,
  city        text not null,
  description text not null default '',
  amenities   text[] not null default '{}',
  specs       jsonb not null default '{}',
  images      text[] not null default '{}',
  status      property_status_t not null default 'available',
  is_public   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_properties_segment_locality on properties(segment, locality);
create index idx_properties_status on properties(status);

-- ── leads ─────────────────────────────────────────────────────────────────
create table leads (
  id                uuid primary key default gen_random_uuid(),
  contact_id        uuid not null references contacts(id) on delete cascade,
  source            lead_source_t not null,
  pipeline_id       text not null references pipelines(id),
  status            text not null references stages(id),
  property_ids      uuid[] not null default '{}',     -- validated against properties by trigger, see 0002
  property_interest text,
  budget_min        numeric(14,2),
  budget_max        numeric(14,2),
  city              text,
  assigned_to       uuid references profiles(id) on delete set null,
  external_ref      text,
  referral_detail   text,
  notes             text not null default '',
  lost_reason       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint lead_budget_range check (budget_min is null or budget_max is null or budget_min <= budget_max)
);
create index idx_leads_assigned_to on leads(assigned_to);
create index idx_leads_pipeline_status on leads(pipeline_id, status);
create index idx_leads_created_at on leads(created_at);
create index idx_leads_property_ids on leads using gin(property_ids);
-- captureLead's hot path: "does this contact already have an open lead".
create index idx_leads_contact_open on leads(contact_id) where status not like '%-won' and status not like '%-lost';

-- ── lead_activities ───────────────────────────────────────────────────────
create table lead_activities (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references leads(id) on delete cascade,
  type       activity_type_t not null,
  body       text not null,
  meta       jsonb not null default '{}',
  actor_id   uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_activities_lead_created on lead_activities(lead_id, created_at desc);

-- ── tasks ─────────────────────────────────────────────────────────────────
create table tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  kind        task_kind_t not null,
  lead_id     uuid references leads(id) on delete cascade,
  property_id uuid references properties(id) on delete set null,
  assigned_to uuid not null references profiles(id),
  due_at      timestamptz not null,
  ends_at     timestamptz,
  status      task_status_t not null default 'pending',
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint task_ends_after_due check (ends_at is null or ends_at > due_at),
  -- findClash() / overlappingIds() in rules.ts: timed, non-cancelled tasks for one person can't overlap.
  exclude using gist (
    assigned_to with =,
    tstzrange(due_at, ends_at) with &&
  ) where (ends_at is not null and status <> 'cancelled')
);
create index idx_tasks_assigned_due on tasks(assigned_to, due_at);
create index idx_tasks_lead on tasks(lead_id);
create index idx_tasks_property on tasks(property_id);

-- ── tickets ───────────────────────────────────────────────────────────────
create table tickets (
  id               uuid primary key default gen_random_uuid(),
  number           int generated always as identity unique,
  title            text not null,
  description      text not null default '',
  status           ticket_status_t not null default 'pending',
  priority         ticket_priority_t not null,
  lead_id          uuid references leads(id) on delete set null,
  property_id      uuid references properties(id) on delete set null,
  raised_by        uuid not null references profiles(id),
  assigned_to      uuid references profiles(id) on delete set null,
  sla_due_at       timestamptz not null,
  escalation_level int not null default 0 check (escalation_level between 0 and 2),
  escalated_at     timestamptz,
  in_progress_at   timestamptz,
  resolved_at      timestamptz,
  created_at       timestamptz not null default now()
);
create index idx_tickets_status on tickets(status);
create index idx_tickets_assigned_to on tickets(assigned_to);
create index idx_tickets_sla_open on tickets(sla_due_at) where status <> 'resolved';

-- ── goals ─────────────────────────────────────────────────────────────────
create table goals (
  id         uuid primary key default gen_random_uuid(),
  period     goal_period_t not null,
  metric     goal_metric_t not null,
  target     numeric(14,2) not null check (target >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period, metric)
);

-- ── documents ─────────────────────────────────────────────────────────────
create table documents (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid references leads(id) on delete cascade,
  property_id   uuid references properties(id) on delete cascade,
  folder        doc_folder_t not null default 'Other',
  name          text not null,
  size          bigint not null check (size >= 0),
  mime          text not null,
  storage_path  text not null unique,
  uploaded_by   uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint doc_attached_to_something check (lead_id is not null or property_id is not null)
);
create index idx_documents_lead on documents(lead_id);
create index idx_documents_property on documents(property_id);
