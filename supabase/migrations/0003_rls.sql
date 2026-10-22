-- Row-level security. Mirrors the visibility rules in rules.ts:
-- isManager, canSeeLead, canSeeTask, canSeeTicket. owner/manager see everything;
-- an agent sees only what is assigned to (or raised by) them.

create function is_manager() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('owner', 'manager') from profiles where id = auth.uid()), false)
$$;

alter table profiles         enable row level security;
alter table pipelines        enable row level security;
alter table stages           enable row level security;
alter table contacts         enable row level security;
alter table properties       enable row level security;
alter table leads            enable row level security;
alter table lead_activities  enable row level security;
alter table tasks            enable row level security;
alter table tickets          enable row level security;
alter table goals            enable row level security;
alter table documents        enable row level security;

-- profiles: the team directory is visible to everyone signed in; only a manager
-- edits someone else, anyone edits their own row.
create policy profiles_select on profiles for select to authenticated using (true);
create policy profiles_update on profiles for update to authenticated
  using (id = auth.uid() or is_manager());

-- pipelines / stages: read-only board structure for everyone, managers configure it.
create policy pipelines_select on pipelines for select to authenticated using (true);
create policy pipelines_write  on pipelines for all    to authenticated using (is_manager()) with check (is_manager());
create policy stages_select    on stages    for select to authenticated using (true);
create policy stages_write     on stages    for all    to authenticated using (is_manager()) with check (is_manager());

-- contacts: shared address book, needed to capture and search leads.
create policy contacts_select on contacts for select to authenticated using (true);
create policy contacts_write  on contacts for insert  to authenticated with check (true);
create policy contacts_update on contacts for update  to authenticated using (true);

-- properties: the catalogue is visible to every signed-in user (and publicly to
-- anon when is_public), only managers maintain listings.
create policy properties_select on properties for select to authenticated using (true);
create policy properties_public on properties for select to anon using (is_public);
create policy properties_write  on properties for all    to authenticated using (is_manager()) with check (is_manager());

-- leads: canSeeLead — manager, or the assignee.
create policy leads_select on leads for select to authenticated
  using (is_manager() or assigned_to = auth.uid());
create policy leads_insert on leads for insert to authenticated with check (true);
create policy leads_update on leads for update to authenticated
  using (is_manager() or assigned_to = auth.uid());
create policy leads_delete on leads for delete to authenticated using (is_manager());

-- lead_activities: visible/writable wherever the parent lead is.
create policy activities_select on lead_activities for select to authenticated
  using (exists (select 1 from leads l where l.id = lead_id and (is_manager() or l.assigned_to = auth.uid())));
create policy activities_insert on lead_activities for insert to authenticated
  with check (exists (select 1 from leads l where l.id = lead_id and (is_manager() or l.assigned_to = auth.uid())));

-- tasks: canSeeTask — manager, or the assignee.
create policy tasks_select on tasks for select to authenticated
  using (is_manager() or assigned_to = auth.uid());
create policy tasks_insert on tasks for insert to authenticated with check (true);
create policy tasks_update on tasks for update to authenticated
  using (is_manager() or assigned_to = auth.uid());
create policy tasks_delete on tasks for delete to authenticated
  using (is_manager() or assigned_to = auth.uid());

-- tickets: canSeeTicket — manager, or the raiser, or the assignee.
create policy tickets_select on tickets for select to authenticated
  using (is_manager() or raised_by = auth.uid() or assigned_to = auth.uid());
create policy tickets_insert on tickets for insert to authenticated with check (true);
create policy tickets_update on tickets for update to authenticated
  using (is_manager() or raised_by = auth.uid() or assigned_to = auth.uid());

-- goals: workspace-wide targets, everyone reads, managers set them.
create policy goals_select on goals for select to authenticated using (true);
create policy goals_write  on goals for all    to authenticated using (is_manager()) with check (is_manager());

-- documents: visible wherever the attached lead (or any property, which is shared) is.
create policy documents_select on documents for select to authenticated
  using (
    property_id is not null
    or exists (select 1 from leads l where l.id = lead_id and (is_manager() or l.assigned_to = auth.uid()))
  );
create policy documents_insert on documents for insert to authenticated with check (true);
create policy documents_delete on documents for delete to authenticated
  using (
    is_manager()
    or exists (select 1 from leads l where l.id = lead_id and l.assigned_to = auth.uid())
  );
