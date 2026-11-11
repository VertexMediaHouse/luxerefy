// Weekly snapshots of the record store, kept in this browser's IndexedDB (localStorage is far too
// small for several copies). Restoring one writes it back to Supabase.
import { db, replaceAll } from './db'
import { deleteFile, getFile, listFiles, putFile } from './mock/files'
import type { Tables } from './types'

const PREFIX = 'backup/'
const WEEK = 7 * 86400e3
/** Two months of weekly snapshots. Older ones are pruned as new ones land. */
const KEEP = 8

/** Every table a restore has to put back. A file missing any of them is rejected. */
export const TABLES = [
  'profiles', 'contacts', 'properties', 'pipelines', 'stages',
  'leads', 'lead_activities', 'tasks', 'tickets', 'documents',
] as const

export interface BackupFile { version: number; taken_at: string; tables: Tables }

export const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1ujrd3jGs16QELkn1yqR5xM8VTCYcbBaRGiH780UbBFg/edit'
export const GOOGLE_SCRIPT_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbzp5XKxbhFneHORqL4FlfJ1HIUpy6rY_GauTS5av_nsaeEAQs7DibR-upff0TR0xMQ8/exec'

export const takenAt = (key: string) => key.slice(PREFIX.length)

/** Newest first. */
export const listBackups = () => listFiles(PREFIX).then(keys => keys.sort().reverse())

export async function syncToGoogleSheet() {
  const payload = {
    version: 3,
    taken_at: new Date().toISOString(),
    tables: db,
  }

  // Google Apps Script requires text/plain or no-cors with body string to avoid preflight issues
  const res = await fetch(GOOGLE_SCRIPT_WEBAPP_URL, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  })

  if (!res.ok) {
    throw new Error(`Google Sheets backup returned status ${res.status}`)
  }

  const data = await res.json().catch(() => null)
  if (data && data.status === 'error') {
    throw new Error(data.message || 'Google Sheets sync failed')
  }

  localStorage.setItem('luxerefy_last_sheet_backup', new Date().toISOString())
  return data
}

export function getLastSheetBackup(): string | null {
  return localStorage.getItem('luxerefy_last_sheet_backup')
}

export async function takeBackup(at = new Date().toISOString()) {
  const body: BackupFile = { version: 3, taken_at: at, tables: db }
  await putFile(PREFIX + at, new Blob([JSON.stringify(body)], { type: 'application/json' }))
  for (const old of (await listBackups()).slice(KEEP)) await deleteFile(old)
  // Background trigger Google Sheet backup sync without blocking
  void syncToGoogleSheet().catch(err => console.warn('Background Google Sheet sync error:', err))
  return at
}

let checking: Promise<string | null> | null = null

/**
 * Checked once when the app loads, which is the only scheduler a browser tab offers.
 * Memoised, so two mounts in the same page load cannot both race in and write a snapshot.
 * ponytail: a tab left closed for a month gets one snapshot on reopening, not four.
 * Move this to a cron job on the server once the store is Postgres.
 */
export function weeklyBackup() {
  return (checking ??= checkAndTake())
}

async function checkAndTake() {
  try {
    const [latest] = await listBackups()
    if (latest && Date.now() - Date.parse(takenAt(latest)) < WEEK) return null
    return await takeBackup()
  } catch {
    return null // no IndexedDB (private window, blocked storage) - the app still works
  }
}

function send(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export async function downloadBackup(key: string) {
  const blob = await getFile(key)
  if (!blob) throw new Error('That snapshot is no longer in this browser.')
  send(blob, `luxerefy-backup-${takenAt(key).slice(0, 10)}.json`)
}

export const downloadNow = () =>
  send(
    new Blob([JSON.stringify({ version: 3, taken_at: new Date().toISOString(), tables: db } satisfies BackupFile)], { type: 'application/json' }),
    `luxerefy-backup-${new Date().toISOString().slice(0, 10)}.json`,
  )

export async function downloadExcelBackup() {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()

  for (const table of TABLES) {
    const rows = (db[table] as unknown as Record<string, unknown>[]) || []
    if (!rows || !rows.length) {
      const ws = XLSX.utils.json_to_sheet([])
      XLSX.utils.book_append_sheet(wb, ws, table)
      continue
    }

    // Format complex objects and arrays into JSON strings for spreadsheet representation
    const formattedRows = rows.map(r => {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(r)) {
        out[k] = v && typeof v === 'object' ? JSON.stringify(v) : v
      }
      return out
    })

    const ws = XLSX.utils.json_to_sheet(formattedRows)
    XLSX.utils.book_append_sheet(wb, ws, table)
  }

  XLSX.writeFile(wb, `luxerefy-backup-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

function parseCellValue(val: unknown) {
  if (typeof val !== 'string') return val
  const s = val.trim()
  if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
    try {
      return JSON.parse(s)
    } catch {
      return val
    }
  }
  return val
}

const PERSON_FIELDS = ['assigned_to', 'created_by', 'actor_id', 'raised_by', 'uploaded_by']

/**
 * Write a backup's tables to Supabase, replacing what is there. Profiles are not restored (they belong
 * to Supabase Auth): people in the file are matched to current accounts by email, anyone unknown
 * (e.g. the old demo 'u-owner') becomes the person restoring. Reloads so every screen shows the result.
 */
async function applyRestore(tables: Partial<Tables>, userId: string) {
  const byEmail = new Map(db.profiles.map(p => [p.email.toLowerCase(), p.id]))
  const known = new Set(db.profiles.map(p => p.id))
  const idMap = new Map((tables.profiles ?? []).map(p => [p.id, byEmail.get(String(p.email).toLowerCase()) ?? userId]))
  const remap = (v: unknown) => (typeof v === 'string' && !known.has(v) ? idMap.get(v) ?? userId : v)
  for (const [name, rows] of Object.entries(tables) as unknown as [string, Record<string, unknown>[]][]) {
    if (name === 'profiles' || !Array.isArray(rows)) continue
    for (const r of rows) for (const f of PERSON_FIELDS) if (r[f] != null) r[f] = remap(r[f])
  }
  await replaceAll(tables)
  location.reload()
}

/**
 * Replace the whole store from a backup file (.json, .xlsx, or single-table .csv).
 */
export async function restoreBackup(file: File, userId: string) {
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()

  if (ext === '.xlsx' || ext === '.xls') {
    const XLSX = await import('xlsx')
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array' })

    const tables: Partial<Tables> = {}
    for (const sheetName of wb.SheetNames) {
      const normalizedName = sheetName.trim().toLowerCase()
      const matchingTable = TABLES.find(t => t.toLowerCase() === normalizedName)
      if (matchingTable) {
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: null })
        const parsedRows = rawRows.map(r => {
          const out: Record<string, unknown> = {}
          for (const [k, v] of Object.entries(r)) {
            out[k] = parseCellValue(v)
          }
          return out
        })
        tables[matchingTable] = parsedRows as never
      }
    }

    // Fill any missing tables with current data to prevent crash
    for (const t of TABLES) {
      if (!Array.isArray(tables[t])) {
        tables[t] = (db[t] ?? []) as never
      }
    }

    if (!(tables.pipelines as unknown[])?.length && !(tables.leads as unknown[])?.length && !(tables.properties as unknown[])?.length) {
      throw new Error('This spreadsheet has no recognized CRM sheets (e.g. leads, properties, contacts).')
    }

    return applyRestore(tables, userId)
  }

  if (ext === '.csv') {
    const XLSX = await import('xlsx')
    const text = await file.text()
    const wb = XLSX.read(text, { type: 'string' })
    const firstSheet = wb.SheetNames[0]
    if (!firstSheet) throw new Error('That CSV file has no data in it.')

    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[firstSheet], { defval: null })
    const parsedRows = rawRows.map(r => {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(r)) {
        out[k] = parseCellValue(v)
      }
      return out
    })

    // Detect which table this CSV belongs to by filename or columns
    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '').toLowerCase()
    const targetTable = TABLES.find(t => nameWithoutExt.includes(t.toLowerCase()))

    if (!targetTable) {
      throw new Error(`Cannot detect which table this CSV belongs to. Please name the file after the table (e.g. leads.csv, properties.csv, contacts.csv).`)
    }

    const tables: Tables = { ...db, [targetTable]: parsedRows }
    return applyRestore(tables, userId)
  }

  // Otherwise handle JSON backup
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    throw new Error('That file is not valid JSON, Excel, or CSV.')
  }
  const tables = (parsed as Partial<BackupFile> | null)?.tables as Record<string, unknown> | undefined
  if (!tables || typeof tables !== 'object') throw new Error('That file is not a Luxerefy backup.')
  const missing = TABLES.filter(t => !Array.isArray(tables[t]))
  if (missing.length) throw new Error(`This backup is missing ${missing.join(', ')}, so it cannot be restored.`)
  if (!(tables.pipelines as unknown[]).length) throw new Error('This backup has no pipelines in it.')

  return applyRestore(tables as Partial<Tables>, userId)
}
