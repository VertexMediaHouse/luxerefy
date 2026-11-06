// In-browser stand-in for Supabase. Only feature api.ts files and lib/stages.ts import this.
import type { Tables } from '../types'
import { escalateTickets } from '../rules'
import { seed } from './seed'

export const KEY = 'luxerefy-crm-mock-v5'

function load(): Tables {
  try {
    const raw = localStorage.getItem(KEY)
    // A store written before pipelines or goals existed would render blank, so re-seed instead.
    if (raw) {
      const t = JSON.parse(raw) as Tables
      if (t.pipelines?.length && t.stages?.length && t.goals) {
        const fresh = seed()
        if (!t.doc_folders || !t.doc_folders.length) {
          t.doc_folders = fresh.doc_folders
          t.documents = fresh.documents
        }
        if (t.leads) {
          t.leads.forEach(l => {
            const seedLead = fresh.leads.find(fl => fl.id === l.id)
            if (seedLead) {
              if (l.locality === undefined) l.locality = seedLead.locality
              if (l.project === undefined) l.project = seedLead.project
              if (l.lead_type === undefined) l.lead_type = seedLead.lead_type
            }
          })
        }
        return t
      }
    }
  } catch { /* unreadable storage → fresh seed */ }
  return seed()
}

export const db: Tables = load()

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)) } catch { /* demo edits just won't survive a reload */ }
}

export function resetDemo() {
  try { localStorage.removeItem(KEY) } catch { /* nothing to clear */ }
  location.reload()
}

/** Simulated round-trip. Returns a copy so cached query data never aliases the store. */
export const respond = <T,>(value: T) => new Promise<T>(r => setTimeout(() => r(structuredClone(value)), 120))

/** Run a write against the store, persist, respond. Throwing inside fn rejects like a failed RLS check. */
export const write = async <T,>(fn: () => T) => {
  const out = fn()
  save()
  return respond(out)
}

/** Stand-in for the pg_cron escalation job: runs whenever ticket data is read. */
export function cron() {
  if (escalateTickets(db)) save()
}
