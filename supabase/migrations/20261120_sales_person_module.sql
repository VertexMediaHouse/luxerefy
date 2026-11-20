-- ============================================================================
-- LUXEREFY CRM — SALES PERSON MODULE MIGRATION
-- ============================================================================
-- Idempotent, NOT reversible: it drops and recreates every policy on profiles, leads, tasks and
-- goals, so policies added outside schema.sql are lost. Run 20261121_sales_module_fixes.sql after it.
--
-- SUMMARY OF CHANGES:
--   1. Role system: allows 'owner', 'manager', 'agent', 'admin', 'sales'
--   2. Profiles metadata: created_by, last_login, must_change_password
--   3. Leads assignment: assigned_by, assigned_at, assignment_method
--   4. New tables: lead_assignment_history, lead_groups, lead_group_members, audit_log
--   5. Tasks enhancements: description, priority, completed_at
--   6. Goals: per-user quotas (user_id)
--   7. Helper functions: is_admin(), is_sales(), updated is_manager()
--   8. Automation triggers: assignment history, audit logs, task completion
--   9. Row Level Security: tightened for sales (no delete, no unassigned access, no reassign)
--  10. Performance indexes: on all new FKs and query filters
-- ============================================================================

-- ─────────────────────── 1. EXTEND ROLE SYSTEM ────────────────────────

-- Dynamically drop any existing check constraint on profiles.role and re-add with admin & sales
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT conname 
    FROM pg_constraint 
    WHERE conrelid = 'profiles'::regclass 
      AND contype = 'c' 
      AND pg_get_constraintdef(oid) LIKE '%role%'
  ) LOOP
    EXECUTE 'ALTER TABLE profiles DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('owner', 'manager', 'agent', 'admin', 'sales'));

-- ─────────────────────── 2. SALES USER METADATA ───────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_login timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

-- ─────────────────────── 3. LEAD ASSIGNMENT TRACKING ──────────────────

ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assignment_method text NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'leads'::regclass 
      AND contype = 'c' 
      AND conname = 'leads_assignment_method_check'
  ) THEN
    ALTER TABLE leads ADD CONSTRAINT leads_assignment_method_check
      CHECK (assignment_method IN ('manual', 'group', 'filter', 'round_robin', 'quota', 'csv'));
  END IF;
END $$;

-- Backfill: existing leads that have an assignee get assigned_at = created_at
UPDATE leads
SET assigned_at = created_at,
    assignment_method = 'manual'
WHERE assigned_to IS NOT NULL
  AND assigned_at IS NULL;

-- ─────────────────────── 4. LEAD ASSIGNMENT HISTORY ───────────────────

CREATE TABLE IF NOT EXISTS lead_assignment_history (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  lead_id text NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  assigned_from uuid REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  assignment_method text NOT NULL DEFAULT 'manual'
    CHECK (assignment_method IN ('manual', 'group', 'filter', 'round_robin', 'quota', 'csv')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_assignment_history_lead ON lead_assignment_history(lead_id);
CREATE INDEX IF NOT EXISTS lead_assignment_history_assigned_to ON lead_assignment_history(assigned_to);

-- ─────────────────────── 5. LEAD GROUPS / LISTS ───────────────────────

CREATE TABLE IF NOT EXISTS lead_groups (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT 'blue',
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lead_group_members (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  group_id text NOT NULL REFERENCES lead_groups(id) ON DELETE CASCADE,
  lead_id text NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  added_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, lead_id)
);

CREATE INDEX IF NOT EXISTS lead_group_members_group ON lead_group_members(group_id);
CREATE INDEX IF NOT EXISTS lead_group_members_lead ON lead_group_members(lead_id);

-- ─────────────────────── 6. TASK ENHANCEMENTS ─────────────────────────

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'tasks'::regclass 
      AND contype = 'c' 
      AND conname = 'tasks_priority_check'
  ) THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_priority_check
      CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
  END IF;
END $$;

-- ─────────────────────── 7. PER-USER GOALS ───────────────────────────

ALTER TABLE goals ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT conname 
    FROM pg_constraint 
    WHERE conrelid = 'goals'::regclass 
      AND contype = 'u'
  ) LOOP
    EXECUTE 'ALTER TABLE goals DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS goals_period_metric_user
  ON goals (period, metric, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ─────────────────────── 8. AUDIT LOG TABLE ───────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL DEFAULT '',
  entity_id text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}',
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_actor ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_log_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS audit_log_action ON audit_log(action);

-- ─────────────────────── 9. HELPER FUNCTIONS ──────────────────────────

CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT my_role() IN ('owner', 'admin')
$$;

CREATE OR REPLACE FUNCTION is_sales() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT my_role() = 'sales'
$$;

CREATE OR REPLACE FUNCTION is_manager() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT my_role() IN ('owner', 'admin', 'manager')
$$;

-- ─────────────────────── 10. AUTOMATION & AUDIT TRIGGERS ──────────────

-- 10.1 Lead assignment history & activity trigger
CREATE OR REPLACE FUNCTION track_lead_assignment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_to IS NOT NULL THEN
      NEW.assigned_at := COALESCE(NEW.assigned_at, now());
      INSERT INTO lead_assignment_history (lead_id, assigned_from, assigned_to, assigned_by, assignment_method)
      VALUES (NEW.id, NULL, NEW.assigned_to, COALESCE(NEW.assigned_by, auth.uid()), COALESCE(NEW.assignment_method, 'manual'));
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (NEW.assigned_to IS DISTINCT FROM OLD.assigned_to) THEN
      NEW.assigned_at := now();
      INSERT INTO lead_assignment_history (lead_id, assigned_from, assigned_to, assigned_by, assignment_method)
      VALUES (NEW.id, OLD.assigned_to, NEW.assigned_to, COALESCE(NEW.assigned_by, auth.uid()), COALESCE(NEW.assignment_method, 'manual'));

      INSERT INTO lead_activities (lead_id, type, body, meta, actor_id)
      VALUES (
        NEW.id,
        'assignment',
        CASE
          WHEN NEW.assigned_to IS NULL THEN 'Lead unassigned'
          WHEN OLD.assigned_to IS NULL THEN 'Lead assigned'
          ELSE 'Lead reassigned'
        END,
        jsonb_build_object(
          'from', OLD.assigned_to,
          'to', NEW.assigned_to,
          'method', NEW.assignment_method
        ),
        COALESCE(NEW.assigned_by, auth.uid())
      );
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS track_lead_assignment ON leads;
CREATE TRIGGER track_lead_assignment
  BEFORE INSERT OR UPDATE OF assigned_to ON leads
  FOR EACH ROW
  EXECUTE FUNCTION track_lead_assignment();

-- 10.2 Prevent sales users from reassigning leads
CREATE OR REPLACE FUNCTION guard_lead_assignment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF is_sales() AND (NEW.assigned_to IS DISTINCT FROM OLD.assigned_to) THEN
    RAISE EXCEPTION 'Sales users cannot reassign leads.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_lead_assignment ON leads;
CREATE TRIGGER guard_lead_assignment
  BEFORE UPDATE OF assigned_to ON leads
  FOR EACH ROW
  EXECUTE FUNCTION guard_lead_assignment();

-- 10.3 Guard profile changes
CREATE OR REPLACE FUNCTION guard_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.active IS DISTINCT FROM OLD.active)
     AND NOT is_admin()
     AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Only admins can change roles.';
  END IF;
  IF auth.uid() = OLD.id AND is_sales() AND
     (NEW.role IS DISTINCT FROM OLD.role OR NEW.active IS DISTINCT FROM OLD.active) THEN
    RAISE EXCEPTION 'You cannot change your own role or status.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_profile ON profiles;
CREATE TRIGGER guard_profile
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION guard_profile();

-- 10.4 Auto-track task completion timestamp
CREATE OR REPLACE FUNCTION track_task_completion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'done' AND (OLD.status IS NULL OR OLD.status <> 'done') THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
  ELSIF NEW.status <> 'done' THEN
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS track_task_completion ON tasks;
CREATE TRIGGER track_task_completion
  BEFORE UPDATE OF status ON tasks
  FOR EACH ROW EXECUTE FUNCTION track_task_completion();

-- 10.5 Auto-update lead_groups updated_at
DROP TRIGGER IF EXISTS set_lead_groups_updated_at ON lead_groups;
CREATE TRIGGER set_lead_groups_updated_at
  BEFORE UPDATE ON lead_groups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 10.6 Audit profile role/active changes
CREATE OR REPLACE FUNCTION audit_profile_changes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.role IS DISTINCT FROM OLD.role) THEN
    INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'profile.role_change', 'profile', NEW.id::text,
            jsonb_build_object('from', OLD.role, 'to', NEW.role));
  END IF;
  IF (NEW.active IS DISTINCT FROM OLD.active) THEN
    INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'profile.status_change', 'profile', NEW.id::text,
            jsonb_build_object('active', NEW.active));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS audit_profile_changes ON profiles;
CREATE TRIGGER audit_profile_changes
  AFTER UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION audit_profile_changes();

-- 10.7 Audit lead deletions
CREATE OR REPLACE FUNCTION audit_lead_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'lead.delete', 'lead', OLD.id,
          jsonb_build_object('contact_id', OLD.contact_id, 'status', OLD.status,
                             'assigned_to', OLD.assigned_to, 'source', OLD.source));
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS audit_lead_delete ON leads;
CREATE TRIGGER audit_lead_delete
  BEFORE DELETE ON leads
  FOR EACH ROW EXECUTE FUNCTION audit_lead_delete();

-- 10.8 Audit lead status changes
CREATE OR REPLACE FUNCTION audit_lead_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.status IS DISTINCT FROM OLD.status) THEN
    INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'lead.status_change', 'lead', NEW.id,
            jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS audit_lead_status ON leads;
CREATE TRIGGER audit_lead_status
  AFTER UPDATE OF status ON leads
  FOR EACH ROW EXECUTE FUNCTION audit_lead_status();

-- ─────────────────────── 11. ROW LEVEL SECURITY (RLS) ─────────────────

-- Enable RLS on all altered & new tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_assignment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Drop existing policies cleanly on altered and new tables
DO $$
DECLARE
  t text;
  p text;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON profiles', p);
  END LOOP;
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'leads' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON leads', p);
  END LOOP;
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tasks' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON tasks', p);
  END LOOP;
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'goals' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON goals', p);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['lead_groups', 'lead_group_members', 'lead_assignment_history', 'audit_log'] LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', p, t);
    END LOOP;
  END LOOP;
END $$;

-- 11.1 PROFILES POLICIES
CREATE POLICY read ON profiles FOR SELECT TO authenticated
  USING (is_staff());

CREATE POLICY add ON profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() OR is_admin());

CREATE POLICY edit ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR is_admin());

-- 11.2 LEADS POLICIES
-- Manager/admin see all. Sales see ONLY assigned leads.
CREATE POLICY see ON leads FOR SELECT TO authenticated
  USING (is_manager() OR assigned_to = auth.uid());

CREATE POLICY add ON leads FOR INSERT TO authenticated
  WITH CHECK (is_staff());

CREATE POLICY edit ON leads FOR UPDATE TO authenticated
  USING (is_manager() OR assigned_to = auth.uid());

-- Sales users CANNOT delete leads. Only managers/admins can delete.
CREATE POLICY remove ON leads FOR DELETE TO authenticated
  USING (is_manager());

-- 11.3 TASKS POLICIES
CREATE POLICY see ON tasks FOR SELECT TO authenticated
  USING (is_manager() OR assigned_to = auth.uid());

CREATE POLICY add ON tasks FOR INSERT TO authenticated
  WITH CHECK (is_staff() AND (is_manager() OR assigned_to = auth.uid()));

CREATE POLICY edit ON tasks FOR UPDATE TO authenticated
  USING (is_manager() OR assigned_to = auth.uid());

CREATE POLICY remove ON tasks FOR DELETE TO authenticated
  USING (is_manager());

-- 11.4 GOALS POLICIES
CREATE POLICY read ON goals FOR SELECT TO authenticated
  USING (is_manager() OR user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY add ON goals FOR INSERT TO authenticated
  WITH CHECK (is_manager());

CREATE POLICY edit ON goals FOR UPDATE TO authenticated
  USING (is_manager());

CREATE POLICY remove ON goals FOR DELETE TO authenticated
  USING (is_manager());

-- 11.5 LEAD GROUPS POLICIES
CREATE POLICY read ON lead_groups FOR SELECT TO authenticated
  USING (is_staff());

CREATE POLICY add ON lead_groups FOR INSERT TO authenticated
  WITH CHECK (is_manager());

CREATE POLICY edit ON lead_groups FOR UPDATE TO authenticated
  USING (is_manager());

CREATE POLICY remove ON lead_groups FOR DELETE TO authenticated
  USING (is_manager());

-- 11.6 LEAD GROUP MEMBERS POLICIES
CREATE POLICY read ON lead_group_members FOR SELECT TO authenticated
  USING (is_staff());

CREATE POLICY add ON lead_group_members FOR INSERT TO authenticated
  WITH CHECK (is_manager());

CREATE POLICY remove ON lead_group_members FOR DELETE TO authenticated
  USING (is_manager());

-- 11.7 LEAD ASSIGNMENT HISTORY POLICIES
-- Sales can only view history for their own assigned leads
CREATE POLICY read ON lead_assignment_history FOR SELECT TO authenticated
  USING (is_manager() OR assigned_to = auth.uid());

-- 11.8 AUDIT LOG POLICIES
-- Only admin/owner can view audit logs
CREATE POLICY read ON audit_log FOR SELECT TO authenticated
  USING (is_admin());

-- ─────────────────────── 12. PERFORMANCE INDEXES ──────────────────────

CREATE INDEX IF NOT EXISTS leads_assigned_at ON leads(assigned_at);
CREATE INDEX IF NOT EXISTS leads_assignment_method ON leads(assignment_method);
CREATE INDEX IF NOT EXISTS tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS tasks_completed_at ON tasks(completed_at) WHERE completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS goals_user ON goals(user_id);
CREATE INDEX IF NOT EXISTS profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS profiles_created_by ON profiles(created_by);
