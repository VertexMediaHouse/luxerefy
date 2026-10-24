import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, DatabaseBackup, Download, ExternalLink, FileSpreadsheet, HardDriveDownload, Loader2, Sheet, Upload } from 'lucide-react'
import { Button, Card, CardHeader, Empty, Loading, PageHeader } from '../../components/ui'
import { dateTime, relative } from '../../lib/format'
import { isManager } from '../../lib/rules'
import { useUser } from '../../lib/session'
import {
  downloadBackup,
  downloadExcelBackup,
  downloadNow,
  getLastSheetBackup,
  GOOGLE_SHEET_URL,
  listBackups,
  restoreBackup,
  syncToGoogleSheet,
  takeBackup,
  takenAt,
} from '../../lib/backup'

export function BackupPage() {
  const user = useUser()
  const mgr = isManager(user)
  const [keys, setKeys] = useState<string[] | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [lastSheetSync, setLastSheetSync] = useState<string | null>(getLastSheetBackup())

  const refresh = () => listBackups().then(setKeys).catch(() => setKeys([]))
  useEffect(() => { void refresh() }, [])

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label)
    setError('')
    setSuccess('')
    try {
      await fn()
      await refresh()
      setLastSheetSync(getLastSheetBackup())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy('')
    }
  }

  const handleSyncGoogleSheet = async () => {
    await run('sheet_sync', async () => {
      await syncToGoogleSheet()
      setSuccess('Successfully backed up all CRM records to your Google Sheet!')
    })
  }

  const restore = async (file: File | undefined) => {
    if (!file) return
    if (!confirm(`Restore from ${file.name}?\n\nThis replaces every lead, contact, property and pipeline in this browser with the contents of that file. It cannot be undone.`)) return
    await run('restore', () => restoreBackup(file))
  }

  if (!keys) return <Loading />

  return (
    <>
      <PageHeader
        icon={DatabaseBackup}
        title="Backups & Cloud Sync"
        subtitle="Live automatic backups to your Google Sheet and browser snapshots kept for 8 weeks."
        actions={mgr ? (
          <>
            <a
              href={GOOGLE_SHEET_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
            >
              <Sheet className="size-4 text-emerald-600" /> Open Google Sheet <ExternalLink className="size-3 text-slate-400" />
            </a>
            <Button
              variant="secondary"
              disabled={!!busy}
              onClick={() => void handleSyncGoogleSheet()}
            >
              {busy === 'sheet_sync' ? <Loader2 className="size-4 animate-spin" /> : <Sheet className="size-4 text-emerald-600" />}
              Sync to Google Sheets
            </Button>
            <Button variant="secondary" onClick={() => void downloadExcelBackup()}>
              <FileSpreadsheet className="size-4 text-emerald-600" /> Download Excel (.xlsx)
            </Button>
            <Button variant="secondary" onClick={downloadNow}>
              <Download className="size-4 text-slate-500" /> Download JSON
            </Button>
            <Button disabled={!!busy} onClick={() => void run('take', takeBackup)}>
              {busy === 'take' ? <Loader2 className="size-4 animate-spin" /> : <HardDriveDownload className="size-4" />} Back up now
            </Button>
          </>
        ) : undefined}
      />

      {error && <p className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-600 ring-1 ring-red-200"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}</p>}
      {success && <p className="mb-4 flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 ring-1 ring-emerald-200"><CheckCircle2 className="mt-0.5 size-4 shrink-0" /> {success}</p>}

      {/* Google Sheet Live Connection Banner */}
      <Card className="mb-4 overflow-hidden border-emerald-100 bg-linear-to-r from-emerald-50/60 to-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <Sheet className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Google Sheets Backup Destination</h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  <span className="size-1.5 rounded-full bg-emerald-600 animate-pulse" /> Connected
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                {lastSheetSync
                  ? `Last synced ${relative(lastSheetSync)} (${dateTime(lastSheetSync)})`
                  : 'Ready to sync all tabs: Leads, Properties, Contacts, Pipelines, Tasks, and Tickets.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              disabled={!!busy}
              onClick={() => void handleSyncGoogleSheet()}
            >
              {busy === 'sheet_sync' ? <Loader2 className="size-3.5 animate-spin" /> : <Sheet className="size-3.5 text-emerald-600" />}
              {busy === 'sheet_sync' ? 'Syncing...' : 'Sync now'}
            </Button>
            <a
              href={GOOGLE_SHEET_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              View Sheet <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader title="Stored snapshots" subtitle={`${keys.length} kept in this browser`} />
          {keys.length ? (
            <ul className="divide-y divide-slate-100">
              {keys.map((k, i) => (
                <li key={k} className="flex items-center gap-3 px-5 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-800">{dateTime(takenAt(k))}</span>
                    <span className="text-xs text-slate-400">{relative(takenAt(k))}{i === 0 && ' · most recent'}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void run(k, () => downloadBackup(k))}
                    className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  >
                    {busy === k ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} Download
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={DatabaseBackup}>No snapshots yet. The first one is taken the next time the CRM loads.</Empty>
          )}
        </Card>

        <div className="space-y-4">
          {mgr && (
            <Card className="p-5">
              <h2 className="text-sm font-medium text-slate-900">Restore from a file</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Replaces records in this browser with the contents of a backup file. Supports <strong>.xlsx</strong> (multi-sheet export or Google Sheet download), <strong>.csv</strong>, or <strong>.json</strong>.
              </p>
              <label className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-soft ring-1 ring-slate-200/80 hover:bg-slate-50">
                {busy === 'restore' ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4 text-slate-500" />} Choose a backup file
                <input
                  type="file"
                  accept=".json,.xlsx,.xls,.csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  className="hidden"
                  onChange={e => void restore(e.target.files?.[0])}
                />
              </label>
            </Card>
          )}

          <Card className="p-5">
            <h2 className="text-sm font-medium text-slate-900">What a snapshot holds</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Every record: leads, contacts, properties, pipelines and their stages, tasks, tickets, documents and the team.
              Uploaded document <em>files</em> stay where they are and are not copied into the snapshot.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Snapshots live in this browser, so clearing site data clears them too. Download the ones you want to keep.
            </p>
          </Card>
        </div>
      </div>
    </>
  )
}
