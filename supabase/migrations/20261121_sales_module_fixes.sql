-- ============================================================================
-- LUXEREFY CRM — SALES MODULE FIXES (run after 20261120_sales_person_module.sql)
-- ============================================================================
-- Fix-forward, idempotent. Run in the Supabase SQL Editor. Needs Postgres 15+
-- (UNIQUE NULLS NOT DISTINCT); every current Supabase project qualifies.
--
-- Not reversible by a script: step 1 rewrites 'agent' rows to 'sales'.
-- Back up `profiles` first if you may need to go back.
--
--   1. One sales role name: 'agent' -> 'sales'
--   2. Signup can no longer pick its own role; self-signups start inactive
--   3. Forced password change enforced in the database, not just the UI
--   4. Assignment triggers: no FK failure on insert, one log row per change
--   5. assign_leads(): permission-checked, all-or-nothing bulk assignment
--   6. Activity / task authorship stamped from the session, not the client
--   7. Goals: unique (period, metric, user_id) so upsert works again
-- ============================================================================

-- ─────────────── 1. ONE ROLE NAME ───────────────
-- auth.uid() is NULL in the SQL editor, so guard_profile lets this through.
UPDATE profiles SET role = 'sales' WHERE role = 'agent';

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('owner', 'admin', 'manager', 'sales'));

-- ─────────────── 2. SIGNUP CANNOT CHOOSE A ROLE ───────────────
-- user_metadata is client-controlled (supabase.auth.signUp options.data), so it never sets the role.
-- The first account becomes the owner; everyone else starts as an inactive sales user until an
-- admin activates them. The admin API (service key) sets role/active right after creating a user.
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE first_user boolean := NOT EXISTS (SELECT 1 FROM profiles);
BEGIN
  INSERT INTO profiles (id, full_name, email, phone, role, active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    CASE WHEN first_user THEN 'owner' ELSE 'sales' END,
    first_user
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;

-- Only admins may create profile rows for other people; the trigger above covers self.
DROP POLICY IF EXISTS add ON profiles;
CREATE POLICY add ON profiles FOR INSERT TO authenticated WITH CHECK (is_admin());

-- ─────────────── 3. FORCED PASSWORD CHANGE ───────────────
-- A flagged user is not staff: every RLS check fails until they set a new password.
CREATE OR REPLACE FUNCTION my_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM profiles WHERE id = auth.uid() AND active AND NOT must_change_password
$$;

-- They still need their own row to see that they are flagged.
DROP POLICY IF EXISTS read ON profiles;
CREATE POLICY read ON profiles FOR SELECT TO authenticated USING (is_staff() OR id = auth.uid());

-- Setting a new password is the only thing that clears the flag.
CREATE OR REPLACE FUNCTION clear_password_flag() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE profiles SET must_change_password = false WHERE id = NEW.id AND must_change_password;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_password_changed ON auth.users;
CREATE TRIGGER on_auth_password_changed
  AFTER UPDATE OF encrypted_password ON auth.users
  FOR EACH ROW WHEN (NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password)
  EXECUTE FUNCTION clear_password_flag();

-- Users cannot change their own role, status or password flag. The service key (auth.uid() NULL),
-- the trigger above (runs as definer, but auth.uid() is the user — so allow false only) and admins can.
CREATE OR REPLACE FUNCTION guard_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR is_admin() THEN RETURN NEW; END IF;
  IF NEW.role IS DISTINCT FROM OLD.role OR NEW.active IS DISTINCT FROM OLD.active
     OR (NEW.must_change_password AND NOT OLD.must_change_password) THEN
    RAISE EXCEPTION 'Only admins can change roles, status or password requirements.';
  END IF;
  -- Clearing the flag is allowed only from clear_password_flag(), i.e. after a real password change.
  IF OLD.must_change_password AND NOT NEW.must_change_password
     AND pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'Set a new password to clear this flag.';
  END IF;
  RETURN NEW;
END $$;

-- ─────────────── 4. ASSIGNMENT TRIGGERS ───────────────
-- schema.sql's AFTER trigger and the 20261120 BEFORE trigger both called track_lead_assignment():
-- every reassignment was logged twice, and the BEFORE INSERT branch wrote history for a lead row
-- that did not exist yet (FK violation). Split into a BEFORE stamp and an AFTER log.
DROP TRIGGER IF EXISTS track_lead_assignment_trg ON leads;
DROP TRIGGER IF EXISTS track_lead_assignment ON leads;

CREATE OR REPLACE FUNCTION stamp_lead_assignment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    IF NEW.assigned_to IS NOT NULL OR TG_OP = 'UPDATE' THEN
      NEW.assigned_at := now();
      NEW.assigned_by := auth.uid();
      -- assign_leads() names its method for this transaction; any other write is manual.
      NEW.assignment_method := COALESCE(NULLIF(current_setting('app.assignment_method', true), ''), 'manual');
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION track_lead_assignment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prev uuid := CASE WHEN TG_OP = 'UPDATE' THEN OLD.assigned_to END;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.assigned_to IS NULL THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN RETURN NULL; END IF;

  INSERT INTO lead_assignment_history (lead_id, assigned_from, assigned_to, assigned_by, assignment_method)
  VALUES (NEW.id, prev, NEW.assigned_to, NEW.assigned_by, NEW.assignment_method);

  IF TG_OP = 'UPDATE' THEN
    INSERT INTO lead_activities (lead_id, type, body, meta, actor_id)
    VALUES (
      NEW.id, 'assignment',
      CASE WHEN NEW.assigned_to IS NULL THEN 'Lead unassigned'
           WHEN prev IS NULL THEN 'Lead assigned'
           ELSE 'Lead reassigned' END,
      jsonb_build_object('from', prev, 'to', NEW.assigned_to, 'method', NEW.assignment_method),
      NEW.assigned_by
    );
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS stamp_lead_assignment ON leads;
CREATE TRIGGER stamp_lead_assignment
  BEFORE INSERT OR UPDATE OF assigned_to ON leads
  FOR EACH ROW EXECUTE FUNCTION stamp_lead_assignment();

CREATE TRIGGER track_lead_assignment
  AFTER INSERT OR UPDATE OF assigned_to ON leads
  FOR EACH ROW EXECUTE FUNCTION track_lead_assignment();

-- ─────────────── 5. BULK ASSIGNMENT ───────────────
-- p_assignments: [{"lead_id": "...", "assigned_to": "<uuid>|null"}, ...]
-- One transaction: either every lead moves or none do.
CREATE OR REPLACE FUNCTION assign_leads(p_assignments jsonb, p_method text DEFAULT 'manual')
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF NOT is_manager() THEN RAISE EXCEPTION 'Only managers can assign leads.'; END IF;
  IF p_method NOT IN ('manual', 'group', 'filter', 'round_robin', 'quota', 'csv') THEN
    RAISE EXCEPTION 'Unknown assignment method: %', p_method;
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_assignments) a
    WHERE a->>'assigned_to' IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM profiles p
                      WHERE p.id = (a->>'assigned_to')::uuid AND p.active AND p.role = 'sales')
  ) THEN
    RAISE EXCEPTION 'Leads can only go to active sales users.';
  END IF;

  PERFORM set_config('app.assignment_method', p_method, true);
  UPDATE leads l SET assigned_to = (a->>'assigned_to')::uuid
  FROM jsonb_array_elements(p_assignments) a
  WHERE l.id = a->>'lead_id';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM set_config('app.assignment_method', '', true);
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION assign_leads(jsonb, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION assign_leads(jsonb, text) TO authenticated;

-- ─────────────── 6. AUTHORSHIP FROM THE SESSION ───────────────
-- The client used to send actor_id / created_by, so anyone could log a note as someone else
-- (and an admin impersonating a rep logged as the rep). The service key keeps what it sends.
CREATE OR REPLACE FUNCTION stamp_actor() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF TG_TABLE_NAME = 'lead_activities' THEN NEW.actor_id := auth.uid();
    ELSE NEW.created_by := auth.uid(); END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS stamp_actor ON lead_activities;
CREATE TRIGGER stamp_actor BEFORE INSERT ON lead_activities FOR EACH ROW EXECUTE FUNCTION stamp_actor();
DROP TRIGGER IF EXISTS stamp_actor ON tasks;
CREATE TRIGGER stamp_actor BEFORE INSERT ON tasks FOR EACH ROW EXECUTE FUNCTION stamp_actor();

-- ─────────────── 7. GOALS UNIQUENESS ───────────────
-- PostgREST upsert needs a real constraint, not an expression index.
DROP INDEX IF EXISTS goals_period_metric_user;
ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_period_metric_user_key;
ALTER TABLE goals ADD CONSTRAINT goals_period_metric_user_key
  UNIQUE NULLS NOT DISTINCT (period, metric, user_id);
