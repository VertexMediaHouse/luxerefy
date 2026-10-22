// Weekly snapshots of the record store. They live in the IndexedDB bucket that already holds
// document bodies, because localStorage is far too small to keep several copies of the data.
import { db } from './mock/db'
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

export const takenAt = (key: string) => key.slice(PREFIX.length)

/** Newest first. */
export const listBackups = () => listFiles(PREFIX).then(keys => keys.sort().reverse())

export async function takeBackup(at = new Date().toISOString()) {
  const body: BackupFile = { version: 3, taken_at: at, tables: db }
  await putFile(PREFIX + at, new Blob([JSON.stringify(body)], { type: 'application/json' }))
  for (const old of (await listBackups()).slice(KEEP)) await deleteFile(old)
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

/**
 * Replace the whole store from a backup file. Now that the store is Postgres, a restore means
 * bulk-upserting every table in FK order against live RLS — risky to do generically, so it's
 * not wired up yet. Restore a snapshot by running its tables through the Supabase SQL editor.
 */
export async function restoreBackup(_file: File): Promise<never> {
  throw new Error('Restoring from a file is not available yet — the data now lives in Supabase, not this browser.')
}
