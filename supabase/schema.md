# Database analysis — luxerefy CRM

Target: Postgres on Supabase. Source of truth for the shape: `src/lib/types.ts`
(the mock already mirrors this 1:1) and the business rules in `src/lib/rules.ts`,
which name the exact SQL this schema implements.

## Entities and relationships

```
auth.users ──1:1── profiles (role: owner/manager/agent)
                       │
pipelines ──1:N── stages (id = `${pipeline_id}-new|-won|-lost` for the 3 reserved kinds)
                       │
contacts ──1:N── leads ──N:1── pipelines
   │                │  │  └──N:1── stages (status, must belong to the lead's pipeline)
   │                │  └──N:M── properties (uuid[] property_ids, validated by trigger)
   │                └──1:N── lead_activities (append-only timeline)
   │
   └── (contacts also referenced by tasks/tickets/documents via leads)

leads ──1:N── tasks ──N:1── profiles (assigned_to)
properties ──1:N── tasks
leads ──1:N── tickets ──N:1── profiles (raised_by, assigned_to)
properties ──1:N── tickets
leads/properties ──1:N── documents
goals (standalone: one row per period × metric)
```

## Key design decisions

- **Stage ids are slugs, not surrogate uuids.** `isOpen`/`isWon`/`isLost` in the app
  test the id's suffix with zero joins. A `CHECK` on `stages` enforces the
  `{pipeline_id}-new|-won|-lost` convention for the three reserved kinds; a
  manager-added custom stage is unconstrained and always reads as "open".
- **`leads.property_ids` is a native `uuid[]`**, not a join table. A lead's
  property interest is an ordered, small, read-mostly list — a junction table
  would add a join for no query Postgres can't already do with a GIN index.
  Referential integrity that an array can't express natively is restored with
  a `BEFORE INSERT OR UPDATE` trigger (`check_lead_properties`) that rejects
  any id not present in `properties`.
- **One open lead per contact** is enforced at the application boundary
  (`capture_lead()`), not a DB constraint, because "open" depends on a suffix
  pattern (`status NOT LIKE '%-won'/'%-lost'`) that a plain unique index can't
  express directly as "only one per contact" without becoming a partial
  index keyed on a derived condition — which is exactly what
  `idx_leads_contact_open` is: a partial index that makes `capture_lead`'s
  dedupe lookup O(log n) instead of a table scan.
- **Double-booking is a constraint, not app logic.** `tasks` has a GiST
  `EXCLUDE` constraint (`btree_gist` + `tsrange`) so two timed, non-cancelled
  tasks for the same `assigned_to` physically cannot overlap — this is the
  same invariant `findClash`/`overlappingIds` check client-side, now
  impossible to violate even from a second writer (an import script, another
  client).
- **SLA and escalation live in SQL functions** (`sla_due`, `escalate_overdue_tickets`)
  so a `pg_cron` job can run the exact same rule the UI shows, with no app
  server required to keep tickets honest:
  ```sql
  select cron.schedule('escalate-tickets', '*/15 * * * *', 'select escalate_overdue_tickets()');
  ```
- **`capture_lead()` is the single write path for every new enquiry** (manual
  entry, 99acres webhook/SMS parser, social forms). It dedupes by normalized
  phone, reuses an existing open lead instead of creating a duplicate, and
  auto-books a next-morning call for 99acres leads — identical behavior to
  `rules.ts: captureLead`, so the client-side mock and the real DB never
  diverge in what counts as a duplicate.
- **RLS mirrors `isManager`/`canSeeLead`/`canSeeTask`/`canSeeTicket` exactly.**
  An agent only ever sees rows assigned to (or raised by) them; owner/manager
  see everything. This is enforced at the database layer, so it holds even if
  a future client bypasses the current app code.

## Files

| File | Contents |
|---|---|
| `migrations/0001_schema.sql` | extensions, enums, tables, constraints, indexes |
| `migrations/0002_functions.sql` | triggers, `capture_lead`, `escalate_overdue_tickets`, `goal_progress`, `normalize_phone`, `sla_due` |
| `migrations/0003_rls.sql` | row-level security policies |

Apply with the Supabase CLI: `supabase db push` (or run the three files in
order against any Postgres 14+ instance with `pgcrypto` and `btree_gist`
available).

## Not modeled (deliberately)

- No `lead_properties` junction table — see above.
- No separate `audit_log` table — `lead_activities` already is one, scoped to
  leads, which is the only entity the app currently needs history for.
- No soft-delete columns — nothing in the app reads a tombstoned row; add
  `deleted_at` only when a "trash" feature exists to read it.
