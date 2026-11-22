-- ============================================================================
-- LUXEREFY CRM — SALES = DATA ENTRY ONLY (run after 20261121_sales_module_fixes.sql)
-- ============================================================================
-- Sales users (incl. the outside calling agency) may read and edit their assigned leads,
-- log activities on them and manage their own tasks. Nothing else is writable, and
-- nothing outside their own leads is readable. Idempotent. Run in the Supabase SQL Editor.
--
--   1. Lead activities: sales can add and read, never edit or delete (call history is permanent)
--   2. Properties: sales can read, only managers can add/edit
--   3. Documents & folders: managers only (sales UI never uses them)
--   4. Goals: only managers write (schema.sql let any staff write)
--   5. Sales cannot create leads for someone else or reassign leads
-- ============================================================================

-- 1. LEAD ACTIVITIES
DROP POLICY IF EXISTS own ON lead_activities;
DROP POLICY IF EXISTS see ON lead_activities;
DROP POLICY IF EXISTS add ON lead_activities;
DROP POLICY IF EXISTS edit ON lead_activities;
DROP POLICY IF EXISTS remove ON lead_activities;
CREATE POLICY see ON lead_activities FOR SELECT TO authenticated
  USING (is_manager() OR EXISTS (SELECT 1 FROM leads l WHERE l.id = lead_id AND l.assigned_to = auth.uid()));
CREATE POLICY add ON lead_activities FOR INSERT TO authenticated
  WITH CHECK (is_manager() OR EXISTS (SELECT 1 FROM leads l WHERE l.id = lead_id AND l.assigned_to = auth.uid()));
CREATE POLICY edit ON lead_activities FOR UPDATE TO authenticated USING (is_manager());
CREATE POLICY remove ON lead_activities FOR DELETE TO authenticated USING (is_manager());

-- 2. PROPERTIES
DROP POLICY IF EXISTS add ON properties;
DROP POLICY IF EXISTS edit ON properties;
CREATE POLICY add ON properties FOR INSERT TO authenticated WITH CHECK (is_manager());
CREATE POLICY edit ON properties FOR UPDATE TO authenticated USING (is_manager());

-- 3. DOCUMENTS
DROP POLICY IF EXISTS staff ON doc_folders;
DROP POLICY IF EXISTS manager ON doc_folders;
CREATE POLICY manager ON doc_folders FOR ALL TO authenticated USING (is_manager()) WITH CHECK (is_manager());
DROP POLICY IF EXISTS see ON documents;
DROP POLICY IF EXISTS add ON documents;
DROP POLICY IF EXISTS edit ON documents;
DROP POLICY IF EXISTS remove ON documents;
CREATE POLICY see ON documents FOR SELECT TO authenticated USING (is_manager());
CREATE POLICY add ON documents FOR INSERT TO authenticated WITH CHECK (is_manager());
CREATE POLICY edit ON documents FOR UPDATE TO authenticated USING (is_manager());
CREATE POLICY remove ON documents FOR DELETE TO authenticated USING (is_manager());

-- 4. GOALS (20261120 already did this; repeated in case schema.sql was re-run after it)
DROP POLICY IF EXISTS write ON goals;

-- 5. LEADS: a sales insert must be assigned to themselves; a sales update cannot move the lead.
DROP POLICY IF EXISTS add ON leads;
CREATE POLICY add ON leads FOR INSERT TO authenticated
  WITH CHECK (is_manager() OR (is_staff() AND assigned_to = auth.uid()));
DROP POLICY IF EXISTS edit ON leads;
CREATE POLICY edit ON leads FOR UPDATE TO authenticated
  USING (is_manager() OR assigned_to = auth.uid())
  WITH CHECK (is_manager() OR assigned_to = auth.uid());
