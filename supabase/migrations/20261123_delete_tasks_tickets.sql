-- Let users delete their own tasks and tickets (managers: any).
DROP POLICY IF EXISTS remove ON tasks;
CREATE POLICY remove ON tasks FOR DELETE TO authenticated
  USING (is_manager() OR assigned_to = auth.uid());

DROP POLICY IF EXISTS remove ON tickets;
CREATE POLICY remove ON tickets FOR DELETE TO authenticated
  USING (is_manager() OR raised_by = auth.uid());

-- Contacts cascade to their leads, so a rep may only delete a contact they added
-- when no other rep owns a lead on it.
DROP POLICY IF EXISTS remove ON contacts;
CREATE POLICY remove ON contacts FOR DELETE TO authenticated
  USING (is_manager() OR (created_by = auth.uid() AND NOT EXISTS (
    SELECT 1 FROM leads l WHERE l.contact_id = contacts.id AND l.assigned_to IS DISTINCT FROM auth.uid())));
