-- Business logic. Each function below mirrors a named function in src/lib/rules.ts —
-- keep the two in sync if the rule changes.

-- ── updated_at bookkeeping ───────────────────────────────────────────────
create function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger trg_properties_updated_at before update on properties
  for each row execute function set_updated_at();
create trigger trg_leads_updated_at before update on leads
  for each row execute function set_updated_at();
create trigger trg_goals_updated_at before update on goals
  for each row execute function set_updated_at();

-- ── new auth user → profile row ──────────────────────────────────────────
create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email), new.email);
  return new;
end $$;

create trigger trg_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ── normalize_phone(): mirrors rules.ts normalizePhone exactly ──────────
-- Indian mobiles -> +91XXXXXXXXXX, other "+<country>" numbers kept as E.164. null = invalid.
create function normalize_phone(raw text) returns text language plpgsql immutable as $$
declare
  s text := trim(raw);
  d text := regexp_replace(s, '\D', '', 'g');
  v_local text;
begin
  if left(s, 1) = '+' and left(s, 3) <> '+91' then
    return case when length(d) between 8 and 15 then '+' || d else null end;
  end if;
  v_local := regexp_replace(d, '^(91|0)(?=\d{10}$)', '');
  return case when v_local ~ '^[6-9]\d{9}$' then '+91' || v_local else null end;
end $$;

-- ── stage-kind helpers: mirror isWonId / isLostId / isOpen in rules.ts ──
create function is_terminal_stage(stage_id text) returns boolean language sql immutable as $$
  select stage_id like '%-won' or stage_id like '%-lost'
$$;

-- ── lead.property_ids must reference real properties (array has no FK) ──
create function check_lead_properties() returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from unnest(new.property_ids) pid
    where not exists (select 1 from properties p where p.id = pid)
  ) then
    raise exception 'property_ids contains an id not present in properties';
  end if;
  return new;
end $$;

create trigger trg_leads_check_properties before insert or update of property_ids on leads
  for each row execute function check_lead_properties();

-- ── lead.status must belong to lead.pipeline_id ──────────────────────────
create function check_lead_stage_pipeline() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from stages s where s.id = new.status and s.pipeline_id = new.pipeline_id) then
    raise exception 'status % is not a stage of pipeline %', new.status, new.pipeline_id;
  end if;
  return new;
end $$;

create trigger trg_leads_check_stage before insert or update of status, pipeline_id on leads
  for each row execute function check_lead_stage_pipeline();

-- ── SLA: mirrors rules.ts SLA_HOURS / slaDue ─────────────────────────────
create function sla_hours(p ticket_priority_t) returns int language sql immutable as $$
  select case p when 'urgent' then 4 when 'high' then 24 when 'normal' then 48 else 72 end
$$;

create function sla_due(created_at timestamptz, p ticket_priority_t) returns timestamptz language sql immutable as $$
  select created_at + make_interval(hours => sla_hours(p))
$$;

create function tickets_default_sla() returns trigger language plpgsql as $$
begin
  if new.sla_due_at is null then
    new.sla_due_at := sla_due(new.created_at, new.priority);
  end if;
  return new;
end $$;

create trigger trg_tickets_default_sla before insert on tickets
  for each row execute function tickets_default_sla();

-- ── escalate_overdue_tickets(): mirrors rules.ts escalateTickets ────────
-- Intended to run on a schedule (pg_cron: select cron.schedule('escalate-tickets',
-- '*/15 * * * *', 'select escalate_overdue_tickets()')). One desk, so overdue tickets
-- get reassigned to the sole active owner, same as the mock.
create function escalate_overdue_tickets(at timestamptz default now()) returns int language plpgsql as $$
declare
  owner_id uuid;
  changed int := 0;
begin
  select id into owner_id from profiles where active and role = 'owner' order by created_at limit 1;
  if owner_id is null then
    select id into owner_id from profiles where active order by created_at limit 1;
  end if;

  update tickets t set
    escalation_level = lvl.level,
    escalated_at = at,
    assigned_to = coalesce(owner_id, t.assigned_to)
  from (
    select id,
      case
        when at <= sla_due_at then 0
        when at - sla_due_at > make_interval(hours => sla_hours(priority)) then 2
        else 1
      end as level
    from tickets
    where status <> 'resolved'
  ) lvl
  where t.id = lvl.id and lvl.level > t.escalation_level;

  get diagnostics changed = row_count;
  return changed;
end $$;

-- ── capture_lead(): mirrors rules.ts captureLead ─────────────────────────
-- Single entry point for every new enquiry. Dedupes by phone: one open lead per contact.
-- Portal (99acres) leads get a first call auto-booked for 10am the next day.
create function capture_lead(
  p_name text, p_phone text, p_source lead_source_t,
  p_email text default null, p_property_ids uuid[] default null, p_pipeline_id text default null,
  p_property_interest text default null, p_budget_min numeric default null, p_budget_max numeric default null,
  p_city text default null, p_external_ref text default null, p_referral_detail text default null,
  p_message text default null, p_notes text default null, p_actor_id uuid default null
) returns leads language plpgsql as $$
declare
  v_phone text := normalize_phone(p_phone);
  v_contact contacts;
  v_lead leads;
  v_pipeline_id text;
  v_owner uuid;
  v_via text;
  v_due timestamptz;
begin
  if v_phone is null then
    raise exception 'Enter a valid mobile number';
  end if;
  v_via := p_source::text || case when p_message is not null then format(': "%s"', p_message) else '' end;

  select * into v_contact from contacts where phone = v_phone;
  if not found then
    insert into contacts (name, phone, email, kind, created_by)
    values (coalesce(nullif(trim(p_name), ''), 'Unknown'), v_phone, nullif(trim(p_email), ''), 'lead', p_actor_id)
    returning * into v_contact;
  end if;

  select * into v_lead from leads
  where contact_id = v_contact.id and not is_terminal_stage(status)
  limit 1;
  if found then
    update leads set updated_at = now() where id = v_lead.id returning * into v_lead;
    insert into lead_activities (lead_id, type, body, actor_id, created_at)
    values (v_lead.id, 'enquiry', 'Enquired again via ' || v_via, p_actor_id, now());
    return v_lead;
  end if;

  v_pipeline_id := coalesce(p_pipeline_id, (select id from pipelines order by position limit 1));
  select id into v_owner from profiles where active and role = 'owner' order by created_at limit 1;
  if v_owner is null then
    select id into v_owner from profiles where active order by created_at limit 1;
  end if;

  insert into leads (
    contact_id, source, pipeline_id, status, property_ids, property_interest,
    budget_min, budget_max, city, external_ref, referral_detail, notes, assigned_to
  ) values (
    v_contact.id, p_source, v_pipeline_id, v_pipeline_id || '-new',
    coalesce((select array_agg(x) from unnest(coalesce(p_property_ids, '{}')) x where x is not null), '{}'),
    p_property_interest, p_budget_min, p_budget_max, p_city, p_external_ref,
    case when p_source = 'referral' then nullif(trim(p_referral_detail), '') else null end,
    coalesce(trim(p_notes), ''), v_owner
  ) returning * into v_lead;

  insert into lead_activities (lead_id, type, body, actor_id, created_at)
  values (v_lead.id, 'created', 'Lead captured from ' || v_via, p_actor_id, now());

  if p_source = '99acres' and v_lead.assigned_to is not null then
    v_due := date_trunc('day', now()) + interval '1 day' + interval '10 hours';
    insert into tasks (title, kind, lead_id, property_id, assigned_to, due_at, status)
    values ('Call ' || v_contact.name || ' (99acres)', 'call', v_lead.id, v_lead.property_ids[1], v_lead.assigned_to, v_due, 'pending');
    insert into lead_activities (lead_id, type, body, created_at)
    values (v_lead.id, 'follow_up', 'Follow-up scheduled for ' || to_char(v_due, 'DD Mon YYYY, HH12:MI AM'), now());
  end if;

  return v_lead;
end $$;

-- ── goal_progress(): mirrors rules.ts goalProgress / periodRange ────────
create function period_start(p goal_period_t, at timestamptz default now()) returns timestamptz language sql immutable as $$
  select case p
    when 'weekly'  then date_trunc('week', at)   -- Postgres weeks start Monday, same as periodRange()
    when 'monthly' then date_trunc('month', at)
    else date_trunc('year', at)
  end
$$;

create function goal_progress(p_period goal_period_t, p_metric goal_metric_t, at timestamptz default now()) returns numeric language plpgsql as $$
declare
  v_start timestamptz := period_start(p_period, at);
  v_end   timestamptz := case p_period
    when 'weekly' then v_start + interval '1 week'
    when 'monthly' then v_start + interval '1 month'
    else v_start + interval '1 year'
  end;
  v_result numeric;
begin
  if p_metric = 'leads' then
    select count(*) into v_result from leads where created_at >= v_start and created_at < v_end;
  elsif p_metric = 'won' then
    select count(*) into v_result from leads where status like '%-won' and updated_at >= v_start and updated_at < v_end;
  elsif p_metric = 'revenue' then
    select coalesce(sum(coalesce(budget_max, budget_min, 0)), 0) into v_result
    from leads where status like '%-won' and updated_at >= v_start and updated_at < v_end;
  else
    select count(*) into v_result from tasks
    where kind = 'site_visit' and status = 'done' and due_at >= v_start and due_at < v_end;
  end if;
  return v_result;
end $$;
