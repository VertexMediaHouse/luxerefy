-- Luxerefy CRM & Sales Person Module Schema
-- Run this in your Supabase Project's SQL Editor (Dashboard > SQL Editor).
-- Safe to run on both brand-new and existing projects.

-- ───────────────────────── 1. CORE TABLES ─────────────────────────

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  phone text not null default '',
  role text not null default 'sales',
  active boolean not null default true
);

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('owner', 'admin', 'manager', 'sales'));

create table if not exists pipelines (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists stages (
  id text primary key,
  pipeline_id text not null references pipelines(id) on delete cascade,
  label text not null,
  tone text not null default 'slate' check (tone in ('slate', 'blue', 'violet', 'amber', 'green', 'red')),
  position int not null default 0,
  kind text not null check (kind in ('entry', 'open', 'won', 'lost'))
);

create table if not exists contacts (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  phone text not null unique,
  email text,
  kind text not null default 'lead' check (kind in ('client', 'lead', 'vendor')),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists properties (
  id text primary key default gen_random_uuid()::text,
  slug text not null unique,
  title text not null,
  project text not null default '',
  config text not null default '',
  area_sqft numeric not null default 0,
  price numeric not null default 0,
  segment text not null default 'residential' check (segment in ('residential', 'commercial')),
  category text not null default 'apartment' check (category in ('apartment', 'plot', 'bungalow', 'weekend_villa', 'weekend_plot')),
  locality text not null default '',
  city text not null default '',
  description text not null default '',
  amenities text[] not null default '{}',
  specs jsonb not null default '{}',
  images text[] not null default '{}',
  status text not null default 'available' check (status in ('available', 'reserved', 'sold', 'off_market')),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists leads (
  id text primary key default gen_random_uuid()::text,
  contact_id text not null references contacts(id) on delete cascade,
  source text not null check (source in ('99acres', 'magic_bricks', 'social_media', 'website', 'property_page', 'print_ad', 'jbn', 'referral', 'walk_in', 'sales_form', 'other')),
  pipeline_id text not null references pipelines(id),
  status text not null,
  property_ids text[] not null default '{}',
  property_interest text,
  locality text,
  project text,
  lead_type text check (lead_type in ('apartment', 'bungalow', 'villa', 'weekend_apartment', 'weekend_villa')),
  budget_min numeric,
  budget_max numeric,
  city text,
  assigned_to uuid references profiles(id) on delete set null,
  external_ref text,
  referral_detail text,
  notes text not null default '',
  lost_reason text,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One open lead per contact
create unique index if not exists leads_one_open_per_contact on leads(contact_id) where status !~ '-(won|lost)$';

create table if not exists lead_activities (
  id text primary key default gen_random_uuid()::text,
  lead_id text not null references leads(id) on delete cascade,
  type text not null check (type in ('created', 'enquiry', 'call', 'text', 'note', 'status_change', 'assignment', 'follow_up')),
  body text not null default '',
  meta jsonb not null default '{}',
  actor_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists lead_activities_lead on lead_activities(lead_id);

-- Lead assignment audit table
create table if not exists lead_assignment_history (
  id uuid primary key default gen_random_uuid(),
  lead_id text not null references leads(id) on delete cascade,
  assigned_from uuid references profiles(id) on delete set null,
  assigned_to uuid references profiles(id) on delete set null,
  assigned_by uuid references profiles(id) on delete set null,
  assignment_method text not null default 'manual',
  created_at timestamptz not null default now()
);
create index if not exists lead_assignment_history_lead on lead_assignment_history(lead_id);

create table if not exists tasks (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  kind text not null check (kind in ('call', 'text', 'follow_up', 'site_visit', 'meeting', 'other')),
  lead_id text references leads(id) on delete cascade,
  property_id text references properties(id) on delete set null,
  assigned_to uuid not null references profiles(id),
  due_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'done', 'cancelled')),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists tickets (
  id text primary key default gen_random_uuid()::text,
  number int not null,
  title text not null,
  description text not null default '',
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'resolved')),
  priority text check (priority in ('low', 'normal', 'high', 'urgent')),
  lead_id text references leads(id) on delete cascade,
  property_id text references properties(id) on delete set null,
  raised_by uuid not null references profiles(id),
  assigned_to uuid references profiles(id) on delete set null,
  sla_due_at timestamptz,
  escalation_level int,
  escalated_at timestamptz,
  in_progress_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists doc_folders (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  parent_id text references doc_folders(id) on delete cascade,
  color text,
  icon text,
  created_at timestamptz not null default now()
);

create table if not exists documents (
  id text primary key default gen_random_uuid()::text,
  lead_id text references leads(id) on delete cascade,
  property_id text references properties(id) on delete set null,
  folder text not null default 'General Documents',
  folder_id text references doc_folders(id) on delete set null,
  name text not null,
  size bigint not null default 0,
  mime text not null default 'application/octet-stream',
  storage_path text not null,
  uploaded_by uuid references profiles(id) on delete set null,
  starred boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists goals (
  id text primary key default gen_random_uuid()::text,
  period text not null check (period in ('weekly', 'monthly', 'yearly')),
  metric text not null check (metric in ('potential_visits', 'site_visits', 'builder_meetings', 'revenue')),
  target numeric not null default 0,
  manual numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period, metric)
);

-- Default board and stages
insert into pipelines (id, name, position) values ('pl-1', 'Sales pipeline', 0) on conflict do nothing;
insert into stages (id, pipeline_id, label, tone, position, kind) values
  ('pl-1-new', 'pl-1', 'New Lead', 'slate', 0, 'entry'),
  ('pl-1-visit', 'pl-1', 'Potential Visit', 'blue', 1, 'open'),
  ('pl-1-udnb', 'pl-1', 'UDNB', 'amber', 2, 'open'),
  ('pl-1-meeting', 'pl-1', 'Potential Meeting', 'violet', 3, 'open'),
  ('pl-1-future', 'pl-1', 'Future Leads', 'slate', 4, 'open'),
  ('pl-1-won', 'pl-1', 'Won', 'green', 5, 'won'),
  ('pl-1-lost', 'pl-1', 'Lost', 'red', 6, 'lost')
on conflict do nothing;

-- Default document folder structure
insert into doc_folders (id, name, parent_id, color, icon) values
  ('f-clients', 'Client Files', null, 'blue', 'folder'),
  ('f-projects', 'Project Files', null, 'purple', 'building'),
  ('f-design', 'Design Assets', null, 'rose', 'image'),
  ('f-video', 'Video Assets', null, 'amber', 'video'),
  ('f-documents', 'Documents', null, 'emerald', 'file-text'),
  ('f-team', 'Team Resources', null, 'slate', 'users')
on conflict do nothing;

-- Performance indexes
create index if not exists tasks_assigned_to on tasks(assigned_to);
create index if not exists tasks_lead on tasks(lead_id);
create index if not exists tasks_due_status on tasks(due_at, status);
create index if not exists leads_assigned_to on leads(assigned_to);
create index if not exists leads_pipeline_status on leads(pipeline_id, status);

-- ───────────────────────── 2. FUNCTIONS & TRIGGERS ─────────────────────────

create or replace function my_role() returns text language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and active
$$;

create or replace function is_staff() returns boolean language sql stable as $$ select my_role() is not null $$;
create or replace function is_manager() returns boolean language sql stable as $$ select my_role() in ('owner', 'manager') $$;

-- Handle user creation in auth.users -> create profile automatically
-- Never read the role from user_metadata: the client controls it at signUp. First account is the
-- owner; anyone else starts as an inactive sales user until an admin activates them.
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare first_user boolean := not exists (select 1 from profiles);
begin
  insert into profiles (id, full_name, email, phone, role, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    case when first_user then 'owner' else 'sales' end,
    first_user
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- Assignment history/activity triggers live in migrations/20261121_sales_module_fixes.sql.

-- Phone normalizer
create or replace function normalize_phone(raw text) returns text language plpgsql immutable as $$
declare s text := btrim(coalesce(raw, '')); d text := regexp_replace(s, '\D', '', 'g'); l text;
begin
  if s like '+%' and s not like '+91%' then
    return case when length(d) between 8 and 15 then '+' || d end;
  end if;
  l := regexp_replace(d, '^(91|0)(\d{10})$', '\2');
  return case when l ~ '^[6-9]\d{9}$' then '+91' || l end;
end $$;

create or replace function normalize_contact_phone() returns trigger language plpgsql as $$
begin
  new.phone := coalesce(normalize_phone(new.phone), new.phone);
  return new;
end $$;
drop trigger if exists normalize_contact_phone_trg on contacts;
create trigger normalize_contact_phone_trg before insert or update of phone on contacts for each row execute function normalize_contact_phone();

-- Updated_at triggers
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists set_properties_updated_at on properties;
create trigger set_properties_updated_at before update on properties for each row execute function set_updated_at();
drop trigger if exists set_leads_updated_at on leads;
create trigger set_leads_updated_at before update on leads for each row execute function set_updated_at();
drop trigger if exists set_goals_updated_at on goals;
create trigger set_goals_updated_at before update on goals for each row execute function set_updated_at();

-- ───────────────────────── 3. ROW LEVEL SECURITY (RLS) ─────────────────────────

do $$ declare t text; p record; begin
  foreach t in array array['profiles','pipelines','stages','contacts','properties','leads','lead_activities','lead_assignment_history','tasks','tickets','doc_folders','documents','goals'] loop
    execute format('alter table %I enable row level security', t);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on %I', p.policyname, t);
    end loop;
  end loop;
end $$;

-- Profiles: staff can view; admin can edit; users can edit self
create policy read on profiles for select to authenticated using (is_staff());
create policy add on profiles for insert to authenticated with check (is_manager());
create policy edit on profiles for update to authenticated using (id = auth.uid() or is_manager());

-- Pipelines & Stages
create policy read on pipelines for select to authenticated using (is_staff());
create policy write on pipelines for all to authenticated using (is_manager()) with check (is_manager());
create policy read on stages for select to authenticated using (is_staff());
create policy write on stages for all to authenticated using (is_manager()) with check (is_manager());

-- Properties
create policy read on properties for select to anon, authenticated using (is_public or is_staff());
create policy add on properties for insert to authenticated with check (is_staff());
create policy edit on properties for update to authenticated using (is_staff());
create policy remove on properties for delete to authenticated using (is_manager());

-- LEADS: CRITICAL SECURITY (Sales users only see and edit their own assigned leads)
create policy see on leads for select to authenticated using (is_manager() or assigned_to = auth.uid());
create policy add on leads for insert to authenticated with check (is_staff());
create policy edit on leads for update to authenticated using (is_manager() or assigned_to = auth.uid());
create policy remove on leads for delete to authenticated using (is_manager());

-- Contacts: visible if manager or lead is assigned
create policy see on contacts for select to authenticated
  using (is_manager() or created_by = auth.uid() or exists (select 1 from leads l where l.contact_id = contacts.id and (is_manager() or l.assigned_to = auth.uid())));
create policy add on contacts for insert to authenticated with check (is_staff());
create policy edit on contacts for update to authenticated
  using (is_manager() or created_by = auth.uid() or exists (select 1 from leads l where l.contact_id = contacts.id and (is_manager() or l.assigned_to = auth.uid())));
create policy remove on contacts for delete to authenticated using (is_manager());

-- Lead Activities: visible only if lead is accessible
create policy own on lead_activities for all to authenticated
  using (is_manager() or exists (select 1 from leads l where l.id = lead_id and l.assigned_to = auth.uid()))
  with check (is_manager() or exists (select 1 from leads l where l.id = lead_id and l.assigned_to = auth.uid()));

-- Lead Assignment History
create policy see_assignment_history on lead_assignment_history for select to authenticated using (is_staff());
create policy add_assignment_history on lead_assignment_history for insert to authenticated with check (is_staff());

-- TASKS: CRITICAL SECURITY (Sales users only access their own tasks)
create policy own on tasks for all to authenticated
  using (is_manager() or assigned_to = auth.uid())
  with check (is_manager() or assigned_to = auth.uid());

-- Tickets, Documents, Goals
create policy see on tickets for select to authenticated using (is_manager() or raised_by = auth.uid() or assigned_to = auth.uid());
create policy add on tickets for insert to authenticated with check (is_staff() and (raised_by = auth.uid() or is_manager()));
create policy edit on tickets for update to authenticated using (is_manager() or raised_by = auth.uid() or assigned_to = auth.uid());
create policy staff on doc_folders for all to authenticated using (is_staff()) with check (is_staff());
create policy see on documents for select to authenticated
  using (is_staff() and (is_manager() or lead_id is null or exists (select 1 from leads l where l.id = lead_id and (is_manager() or l.assigned_to = auth.uid()))));
create policy add on documents for insert to authenticated with check (is_staff());
create policy edit on documents for update to authenticated using (is_staff());
create policy remove on documents for delete to authenticated using (is_manager() or uploaded_by = auth.uid());
create policy read on goals for select to authenticated using (is_staff());
create policy write on goals for all to authenticated using (is_staff()) with check (is_staff());
