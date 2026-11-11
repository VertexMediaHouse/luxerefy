// In-browser stand-in for Supabase: tables live in localStorage, seeded from lib/mock/seed.ts.
// Keeps the exact export surface the Supabase-backed version had, so feature api.ts files are unchanged.
// ponytail: single-browser demo store. Restore the Supabase version (git show 501716f:src/lib/db.ts)
// once a live project exists again.
import { captureLead, escalateTickets, type CaptureInput } from './rules'
import { seed } from './mock/seed'
import type { Tables } from './types'

const KEY = 'luxerefy-crm-mock-v5'

function restore(): Tables {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const t = JSON.parse(raw) as Tables
      // A store written before a table existed would render blank, so re-seed instead of patching.
      if (t.pipelines?.length && t.stages?.length && t.goals && t.doc_folders) return t
    }
  } catch { /* unreadable storage → fresh seed */ }
  return seed()
}

export const db: Tables = restore()

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)) } catch { /* demo edits just won't survive a reload */ }
}

export function resetDemo() {
  try { localStorage.removeItem(KEY) } catch { /* nothing to clear */ }
  location.reload()
}

/** No-ops: there is no server to sync with. Kept so session.tsx and BackupPage need no changes. */
export const load = async () => {}
export const reload = async () => {}

/** Simulated round-trip. Returns a copy so cached query data never aliases the store. */
export const respond = <T,>(value: T) => new Promise<T>(r => setTimeout(() => r(structuredClone(value)), 120))

const friendly = (e: unknown) => (e instanceof Error ? e : new Error('Something went wrong'))

/** Run a write against the store, persist, respond. Throwing inside fn rejects like a failed RLS check. */
export async function write<T>(fn: () => T) {
  try {
    const out = fn()
    save()
    return structuredClone(out)
  } catch (e) {
    throw friendly(e)
  }
}

/** Local port of the capture_leads RPC (supabase/schema.sql): dedupes by phone, logs a repeat enquiry. */
export async function captureRemote(rows: object[]) {
  const actor = db.profiles.find(p => p.active) ?? null
  const out = rows.map(r => {
    try {
      const { lead, created } = captureLead(db, r as CaptureInput, actor)
      return { id: lead.id, created }
    } catch (e) {
      return { error: (e as Error).message }
    }
  })
  save()
  return out as ({ id: string; created: boolean; error?: undefined } | { error: string })[]
}

/** Replace whole tables (backup restore). */
export async function replaceAll(tables: Partial<Tables>) {
  return write(() => {
    for (const t of Object.keys(db) as (keyof Tables)[])
      if (t !== 'profiles' && Array.isArray(tables[t])) (db as unknown as Record<string, unknown>)[t] = tables[t]
  })
}

/** Stand-in for a pg_cron escalation job: runs whenever ticket data is read. */
export function cron() {
  if (escalateTickets(db)) save()
}
