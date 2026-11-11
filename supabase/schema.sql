-- Luxerefy CRM schema. Mirrors src/lib/types.ts table for table.
-- Run once in the Supabase SQL editor on an empty project. Safe to re-run: everything is "if not exists"
-- or "create or replace", except policies, which are dropped and re-created.
--
-- Ids are text (the app generates crypto.randomUUID() and stage ids like 'pl-1-new').
-- profiles.id is the Supabase Auth user id, so everything that points at a person is uuid.

-- ───────────────────────── tables ─────────────────────────

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  phone text not null default '',
  role text not null default 'agent' check (role in ('owner', 'manager', 'agent')),
  active boolean not null default true
);

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
  source text not null check (source in ('99acres', 'social_media', 'website', 'property_page', 'print_ad', 'jbn', 'referral', 'walk_in', 'sales_form', 'other')),
  pipeline_id text not null references pipelines(id),
  status text not null, -- a stage id; no FK so a lead survives its stage being removed (see stages.ts)
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
  raw_payload jsonb, -- untouched webhook body, for audit / re-parsing if a portal changes its format
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One open lead per contact (open = stage id not ending in -won / -lost, same as isOpen in rules.ts).
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
  storage_path text not null, -- key in the private 'documents' storage bucket
  uploaded_by uuid references profiles(id) on delete set null,
  starred boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists goals (
  id text primary key default gen_random_uuid()::text,
  period text not null check (period in ('weekly', 'monthly', 'yearly')),
  metric text not null check (metric in ('leads', 'won', 'revenue', 'site_visits')),
  target numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period, metric)
);

-- Default board. The app needs at least one pipeline with these stage ids (see seed.ts / rules.ts entryOf).
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

-- ───────────────────────── helpers ─────────────────────────

-- Role of the signed-in user, null for anon or deactivated staff. Security definer so policies can call it
-- without recursing into profiles' own RLS.
create or replace function my_role() returns text language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and active
$$;
create or replace function is_staff() returns boolean language sql stable as $$ select my_role() is not null $$;
create or replace function is_manager() returns boolean language sql stable as $$ select my_role() in ('owner', 'manager') $$;

-- New Auth user -> profiles row. The very first account becomes the owner; everyone after starts as agent.
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, email, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), coalesce(new.email, ''),
          case when exists (select 1 from profiles) then 'agent' else 'owner' end);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- Only the owner may change anyone's role or access (TeamPage). Staff can still edit their own name/phone.
create or replace function guard_profile() returns trigger language plpgsql as $$
begin
  if (new.role is distinct from old.role or new.active is distinct from old.active) and my_role() is distinct from 'owner'
     and auth.uid() is not null then
    raise exception 'Only the owner can change roles.';
  end if;
  return new;
end $$;
drop trigger if exists guard_profile on profiles;
create trigger guard_profile before update on profiles for each row execute function guard_profile();

-- Agents only see their own tickets, so the number the browser picks can collide. Fix it up on insert.
create or replace function ticket_number() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.number is null or exists (select 1 from tickets where number = new.number and id <> new.id) then
    new.number := coalesce((select max(number) from tickets), 0) + 1;
  end if;
  return new;
end $$;
drop trigger if exists ticket_number on tickets;
create trigger ticket_number before insert on tickets for each row execute function ticket_number();

-- Port of normalizePhone in src/lib/rules.ts. Keep the two in sync: contacts dedupe on this value.
create or replace function normalize_phone(raw text) returns text language plpgsql immutable as $$
declare s text := btrim(coalesce(raw, '')); d text := regexp_replace(s, '\D', '', 'g'); l text;
begin
  if s like '+%' and s not like '+91%' then
    return case when length(d) between 8 and 15 then '+' || d end;
  end if;
  l := regexp_replace(d, '^(91|0)(\d{10})$', '\2');
  return case when l ~ '^[6-9]\d{9}$' then '+91' || l end;
end $$;

-- Port of captureLead in src/lib/rules.ts: the one entry point for every new enquiry
-- (app form, sheet import, public sales form, property page, 99acres webhook).
-- Dedupes by phone: an existing open lead gets an "enquired again" entry instead of a duplicate.
-- Security definer because anon (public forms) must not be able to read or write tables directly.
-- Takes an array of CaptureInput objects; returns one {id, created} or {error} per row, in order.
create or replace function capture_leads(rows jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb; result jsonb := '[]'; actor uuid := auth.uid(); owner_id uuid; assignee uuid;
  ph text; src text; via text; c_id text; c_name text; l_id text; pl text; due timestamptz; props text[];
begin
  if actor is not null and not is_staff() then raise exception 'Your account is not active.'; end if;
  select id into owner_id from profiles where active order by (role = 'owner') desc limit 1;

  for r in select * from jsonb_array_elements(rows) loop
    begin
      ph := normalize_phone(r->>'phone');
      if ph is null then raise exception 'Enter a valid mobile number'; end if;
      src := coalesce(nullif(r->>'source', ''), 'other');
      via := case src when '99acres' then '99acres' when 'social_media' then 'Social media' when 'website' then 'Website'
        when 'property_page' then 'Property page' when 'print_ad' then 'Print Ad' when 'jbn' then 'JBN' when 'referral' then 'Referral'
        when 'walk_in' then 'Walk-in' when 'sales_form' then 'Sales form' else 'Other' end
        || coalesce(': "' || nullif(btrim(r->>'message'), '') || '"', '');

      select id, name into c_id, c_name from contacts where phone = ph;
      if c_id is null then
        insert into contacts (name, phone, email, kind, created_by)
        values (coalesce(nullif(btrim(r->>'name'), ''), 'Unknown'), ph, nullif(btrim(r->>'email'), ''), 'lead', actor)
        returning id, name into c_id, c_name;
      end if;

      select id into l_id from leads where contact_id = c_id and status !~ '-(won|lost)$' limit 1;
      if l_id is not null then
        update leads set updated_at = now() where id = l_id;
        insert into lead_activities (lead_id, type, body, actor_id) values (l_id, 'enquiry', 'Enquired again via ' || via, actor);
        result := result || jsonb_build_object('id', l_id, 'created', false);
        continue;
      end if;

      select id into pl from pipelines where id = r->>'pipeline_id';
      if pl is null then select id into pl from pipelines order by position limit 1; end if;
      select id into assignee from profiles where active and id::text = r->>'assigned_to';
      assignee := coalesce(assignee, owner_id);
      select coalesce(array_agg(x), '{}') into props from jsonb_array_elements_text(
        case when jsonb_typeof(r->'property_ids') = 'array' then r->'property_ids' else '[]' end) x where x <> '';

      insert into leads (contact_id, source, pipeline_id, status, property_ids, property_interest, locality, project, lead_type,
                         budget_min, budget_max, city, assigned_to, external_ref, referral_detail, notes, raw_payload)
      values (c_id, src, pl, pl || '-new', props, nullif(r->>'property_interest', ''), nullif(r->>'locality', ''),
              nullif(r->>'project', ''), nullif(r->>'lead_type', ''),
              nullif(r->>'budget_min', '')::numeric, nullif(r->>'budget_max', '')::numeric, nullif(r->>'city', ''),
              assignee, nullif(r->>'external_ref', ''),
              case when src in ('referral', 'sales_form') then nullif(btrim(r->>'referral_detail'), '') end,
              coalesce(btrim(r->>'notes'), ''), r->'raw_payload')
      returning id into l_id;
      insert into lead_activities (lead_id, type, body, actor_id) values (l_id, 'created', 'Lead captured from ' || via, actor);

      -- Portal leads get a first call booked for 10 AM IST the next day so nothing sits untouched.
      if src = '99acres' and assignee is not null then
        due := (date_trunc('day', now() at time zone 'Asia/Kolkata') + interval '1 day 10 hours') at time zone 'Asia/Kolkata';
        insert into tasks (title, kind, lead_id, property_id, assigned_to, due_at)
        values ('Call ' || c_name || ' (99acres)', 'call', l_id, props[1], assignee, due);
        insert into lead_activities (lead_id, type, body, actor_id)
        values (l_id, 'follow_up', 'Follow-up scheduled for ' || to_char(due at time zone 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM'), null);
      end if;

      result := result || jsonb_build_object('id', l_id, 'created', true);
    exception when others then
      result := result || jsonb_build_object('error', sqlerrm);
    end;
  end loop;
  return result;
end $$;
grant execute on function capture_leads(jsonb) to anon, authenticated;

-- ───────────────────────── row level security ─────────────────────────
-- Mirrors the canSee* rules in src/lib/rules.ts and the feature api.ts files.
-- Policies on child tables use "exists (select ... from leads)", which runs under leads' own RLS,
-- so an agent automatically sees only the activities/tasks/docs of leads assigned to them.

do $$ declare t text; p record; begin
  foreach t in array array['profiles','pipelines','stages','contacts','properties','leads','lead_activities','tasks','tickets','doc_folders','documents','goals'] loop
    execute format('alter table %I enable row level security', t);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on %I', p.policyname, t);
    end loop;
  end loop;
end $$;

create policy read on profiles for select to authenticated using (is_staff());
-- Upserts check the insert policy even when the row exists, so profiles needs one.
create policy add on profiles for insert to authenticated with check (id = auth.uid() or my_role() = 'owner');
create policy edit on profiles for update to authenticated using (id = auth.uid() or my_role() = 'owner');

create policy read on pipelines for select to authenticated using (is_staff());
create policy write on pipelines for all to authenticated using (is_manager()) with check (is_manager());
create policy read on stages for select to authenticated using (is_staff());
create policy write on stages for all to authenticated using (is_manager()) with check (is_manager());

-- Public property page and sales form read listed properties without signing in.
create policy read on properties for select to anon, authenticated using (is_public or is_staff());
create policy add on properties for insert to authenticated with check (is_staff());
create policy edit on properties for update to authenticated using (is_staff());
create policy remove on properties for delete to authenticated using (is_manager());

create policy see on leads for select to authenticated using (is_manager() or assigned_to = auth.uid());
create policy add on leads for insert to authenticated with check (is_staff());
create policy edit on leads for update to authenticated using (is_manager() or assigned_to = auth.uid());
create policy remove on leads for delete to authenticated using (is_manager() or assigned_to = auth.uid());

create policy see on contacts for select to authenticated
  using (is_manager() or created_by = auth.uid() or exists (select 1 from leads l where l.contact_id = contacts.id));
create policy add on contacts for insert to authenticated with check (is_staff());
create policy edit on contacts for update to authenticated
  using (is_manager() or created_by = auth.uid() or exists (select 1 from leads l where l.contact_id = contacts.id));
create policy remove on contacts for delete to authenticated using (is_manager());

create policy own on lead_activities for all to authenticated
  using (exists (select 1 from leads l where l.id = lead_id)) with check (exists (select 1 from leads l where l.id = lead_id));

create policy own on tasks for all to authenticated
  using (is_manager() or assigned_to = auth.uid()) with check (is_manager() or assigned_to = auth.uid());

create policy see on tickets for select to authenticated using (is_manager() or raised_by = auth.uid() or assigned_to = auth.uid());
create policy add on tickets for insert to authenticated with check (is_staff() and (raised_by = auth.uid() or is_manager()));
create policy edit on tickets for update to authenticated using (is_manager() or raised_by = auth.uid() or assigned_to = auth.uid());

create policy staff on doc_folders for all to authenticated using (is_staff()) with check (is_staff());

-- Client paperwork follows the lead; property-only and general docs are visible to all staff.
create policy see on documents for select to authenticated
  using (is_staff() and (is_manager() or lead_id is null or exists (select 1 from leads l where l.id = lead_id)));
create policy add on documents for insert to authenticated with check (is_staff());
create policy edit on documents for update to authenticated
  using (is_staff() and (is_manager() or lead_id is null or exists (select 1 from leads l where l.id = lead_id)));
create policy remove on documents for delete to authenticated using (is_manager() or uploaded_by = auth.uid());

create policy read on goals for select to authenticated using (is_staff());
create policy write on goals for all to authenticated using (is_staff()) with check (is_staff());

-- ───────────────────────── file storage ─────────────────────────
-- Private bucket. A file is readable only if its documents row is (that check runs under documents' RLS).

insert into storage.buckets (id, name, public) values ('documents', 'documents', false) on conflict do nothing;
drop policy if exists "crm docs read" on storage.objects;
drop policy if exists "crm docs upload" on storage.objects;
drop policy if exists "crm docs delete" on storage.objects;
create policy "crm docs read" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and exists (select 1 from public.documents d where d.storage_path = objects.name));
create policy "crm docs upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.is_staff());
create policy "crm docs delete" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and exists (select 1 from public.documents d where d.storage_path = objects.name
         and (public.is_manager() or d.uploaded_by = auth.uid())));
