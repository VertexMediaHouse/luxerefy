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
/** Per-table request counter: a slow, older read must not overwrite a newer one that landed first. */
const seq: Partial<Record<keyof Tables, number>> = {}
export async function refresh(tables: readonly (keyof Tables)[] = TABLES) {
  const mine = tables.map(t => (seq[t] = (seq[t] ?? 0) + 1))
  const results = await Promise.all(tables.map(selectAll))
  results.forEach((rows, i) => { if (seq[tables[i]] === mine[i]) (db[tables[i]] as unknown[]) = rows })
}

/** Tables named in supabase.from() since the last take(), so a write re-pulls only what it touched. */
const touched = new Set<keyof Tables>()
const from = supabase.from.bind(supabase)
supabase.from = ((t: keyof Tables) => (touched.add(t), from(t))) as typeof supabase.from
/** FK cascades and set-nulls in schema.sql: a write to the key changes these tables too. */
const DEPENDS: Partial<Record<keyof Tables, (keyof Tables)[]>> = {
  pipelines: ['stages', 'leads'],
  contacts: ['leads', 'lead_activities', 'tasks', 'tickets', 'documents'],
  leads: ['lead_activities', 'tasks', 'tickets', 'documents'],
  doc_folders: ['documents'],
  profiles: TABLES,
}
// ponytail: one global set, so two overlapping writes can share it; the later refresh still catches up.
const take = () => {
  const t = new Set([...touched].filter(x => TABLES.includes(x)))
  for (const x of [...t]) for (const d of DEPENDS[x] ?? []) t.add(d)
  touched.clear()
  return [...t]
}

/** PostgREST caps a response at 1000 rows, so read in pages. Without this, backups silently drop rows. */
const PAGE = 1000
async function selectAll(t: keyof Tables) {
  // First page carries the total, so the remaining pages are fetched in parallel, not one by one.
  const page = (i: number, count?: 'exact') => from(t).select('*', count ? { count } : undefined).order('id').range(i * PAGE, i * PAGE + PAGE - 1)
  const first = await page(0, 'exact')
  if (first.error) throw new Error(`${t}: ${first.error.message}`)
  const n = Math.ceil((first.count ?? 0) / PAGE)
  const rest = await Promise.all(Array.from({ length: Math.max(0, n - 1) }, (_, i) => page(i + 1)))
  for (const r of rest) if (r.error) throw new Error(`${t}: ${r.error.message}`)
  return [...first.data, ...rest.flatMap(r => r.data ?? [])]
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
  take()
  const out = await fn()
  const t = take()
  await refresh(t.length ? t : TABLES)
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
  await refresh(['leads', 'contacts', 'lead_activities', 'tasks']).catch(() => {})
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
