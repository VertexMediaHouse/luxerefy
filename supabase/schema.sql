-- Tables the 99acres webhook writes to. Shapes mirror src/lib/types.ts.
-- Run once in Supabase SQL editor. Text ids so the app's 'pl-1' / 'pl-1-new' style ids fit.

create table if not exists pipelines (
  id text primary key,
  name text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);
insert into pipelines (id, name, position) values ('pl-1', 'Sales pipeline', 0) on conflict do nothing;

create table if not exists contacts (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  phone text not null unique,
  email text,
  kind text not null default 'lead' check (kind in ('client', 'lead', 'vendor')),
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists leads (
  id text primary key default gen_random_uuid()::text,
  contact_id text not null references contacts(id),
  source text not null,
  pipeline_id text not null references pipelines(id),
  status text not null,
  property_ids text[] not null default '{}',
  property_interest text,
  locality text,
  project text,
  lead_type text,
  budget_min numeric,
  budget_max numeric,
  city text,
  assigned_to text,
  external_ref text,
  referral_detail text,
  notes text not null default '',
  lost_reason text,
  raw_payload jsonb, -- untouched webhook body, for audit / re-parsing if the sender's format changes
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS on with no policies: only the service-role key (server side) can read/write.
-- Add policies when the React app moves off the mock layer.
alter table pipelines enable row level security;
alter table contacts enable row level security;
alter table leads enable row level security;
