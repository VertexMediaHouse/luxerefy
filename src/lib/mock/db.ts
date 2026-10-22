// Supabase-backed store. `db` is a live mirror of the tables the current user's RLS allows;
// `write(fn)` runs fn (which issues the real Supabase calls), then refreshes the mirror so
// every query hook (which still reads `db` directly, same as the old mock) sees the new state.
import { supabase } from '../supabase'
import type { Tables } from '../types'

export const db: Tables = {
  profiles: [], contacts: [], properties: [], pipelines: [], stages: [], leads: [],
  lead_activities: [], tasks: [], tickets: [], documents: [], goals: [],
}

const TABLES = Object.keys(db) as (keyof Tables)[]

export async function refresh() {
  const results = await Promise.all(TABLES.map(t => supabase.from(t).select('*')))
  results.forEach((r, i) => {
    if (r.error) throw new Error(r.error.message)
    ;(db[TABLES[i]] as unknown[]) = r.data ?? []
  })
}

/** Kept so call sites that just return a value don't need to change. */
export const respond = <T,>(value: T) => Promise.resolve(value)

/** Run a real write against Supabase, then refresh the mirror. Throwing inside fn rejects like a failed RLS check. */
export const write = async <T,>(fn: () => Promise<T>): Promise<T> => {
  const out = await fn()
  await refresh()
  return out
}

/** Escalation now runs server-side (pg_cron calling escalate_overdue_tickets()); nothing to do client-side. */
export function cron() {}
