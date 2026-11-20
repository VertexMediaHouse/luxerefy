// Supabase-backed store. `db` is a live mirror of the rows the current user's RLS allows, so the
// query hooks and render-time helpers (stages.ts, LeadBoard) can keep reading it synchronously.
// `write(fn)` runs the real Supabase calls in fn, then refreshes the mirror so every hook sees
// the new state. Anon visitors (public property page, sales form) get the same mirror, which RLS
// narrows to public properties — every other table simply comes back empty.
import { supabase } from './supabase'
import type { Tables } from './types'

export const db: Tables = {
  profiles: [], contacts: [], properties: [], pipelines: [], stages: [], leads: [],
  lead_activities: [], tasks: [], tickets: [], documents: [], doc_folders: [], goals: [],
}

const TABLES = Object.keys(db) as (keyof Tables)[]

/** Pull every readable row into the mirror. Throws on a real failure (bad key, project down). */
export async function refresh() {
  const results = await Promise.all(TABLES.map(selectAll))
  results.forEach((rows, i) => { (db[TABLES[i]] as unknown[]) = rows })
}

/** PostgREST caps a response at 1000 rows, so read in pages. Without this, backups silently drop rows. */
const PAGE = 1000
async function selectAll(t: keyof Tables) {
  const rows: unknown[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(t).select('*').order('id').range(from, from + PAGE - 1)
    if (error) throw new Error(`${t}: ${error.message}`)
    rows.push(...data)
    if (data.length < PAGE) return rows
  }
}

/** Bootstrap / re-bootstrap the mirror. Kept as two names because session.tsx and BackupPage use both. */
export const load = refresh
export const reload = refresh

/** Kept so call sites that just hand back a value don't need to change. */
export const respond = <T,>(value: T) => Promise.resolve(value)

/** Set by main.tsx: lets a bare write() (outside useMutation) re-render the pages reading the mirror. */
export const writeHooks = { after: () => {} }

/** Run a real write against Supabase, then refresh the mirror. Throwing inside fn rejects like a failed RLS check. */
export async function write<T>(fn: () => T | Promise<T>): Promise<T> {
  const out = await fn()
  await refresh()
  writeHooks.after()
  return out
}

/** Throw PostgREST errors as plain Errors, so the existing mutation error UI needs no change. */
export function ok<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  return r.data
}

export type CaptureResult = { id: string; created: boolean; error?: undefined } | { error: string }

/**
 * The capture_leads RPC: dedupes by phone, logs the activity, books the 99acres call.
 * Security definer, granted to anon, so the public forms reach it without reading any table.
 */
export async function captureRemote(rows: object[]): Promise<CaptureResult[]> {
  const { data, error } = await supabase.rpc('capture_leads', { rows })
  if (error) throw new Error(error.message)
  // Anon has no select grant, so only a signed-in caller can see the new rows.
  await refresh().catch(() => {})
  return (data ?? []) as CaptureResult[]
}

/**
 * Replace whole tables (backup restore). Profiles are left alone: they belong to Supabase Auth.
 * Children go first on the way out and last on the way in, so FKs hold at every step.
 */
export async function replaceAll(tables: Partial<Tables>) {
  const order: (keyof Tables)[] = [
    'pipelines', 'stages', 'contacts', 'properties', 'leads',
    'lead_activities', 'tasks', 'tickets', 'doc_folders', 'documents', 'goals',
  ]
  for (const t of [...order].reverse())
    if (Array.isArray(tables[t])) ok(await supabase.from(t).delete().neq('id', ''))
  for (const t of order) {
    const rows = tables[t]
    if (Array.isArray(rows) && rows.length) ok(await supabase.from(t).insert(rows as never))
  }
  await refresh()
}

/** Escalation runs server-side (pg_cron calling the SQL escalation job); nothing to do in the browser. */
export function cron() {}
