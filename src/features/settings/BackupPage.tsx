import { useEffect, useState } from 'react'
import { AlertTriangle, DatabaseBackup, Download, HardDriveDownload, Loader2, Upload } from 'lucide-react'
import { Button, Card, CardHeader, Empty, Loading, PageHeader } from '../../components/ui'
import { dateTime, relative } from '../../lib/format'
import { isManager } from '../../lib/rules'
import { useUser } from '../../lib/session'
import { downloadBackup, downloadNow, listBackups, restoreBackup, takeBackup, takenAt } from '../../lib/backup'

export function BackupPage() {
  const user = useUser()
  const mgr = isManager(user)
  const [keys, setKeys] = useState<string[] | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const refresh = () => listBackups().then(setKeys).catch(() => setKeys([]))
  useEffect(() => { void refresh() }, [])

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label)
    setError('')
    try { await fn(); await refresh() } catch (e) { setError((e as Error).message) } finally { setBusy('') }
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
        tint="text-sky-600"
        title="Backups"
        subtitle="A snapshot is taken automatically once a week when you open the CRM. The last eight are kept."
        actions={mgr ? (
          <>
            <Button variant="secondary" onClick={downloadNow}><Download className="size-4 text-slate-500" /> Download current</Button>
            <Button disabled={!!busy} onClick={() => void run('take', takeBackup)}>
              {busy === 'take' ? <Loader2 className="size-4 animate-spin" /> : <HardDriveDownload className="size-4" />} Back up now
            </Button>
          </>
        ) : undefined}
      />

      {error && <p className="mb-4 flex items-start gap-2 text-sm text-red-600"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}</p>}

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
                Replaces everything in this browser with the contents of a backup file. You will be asked to confirm.
              </p>
              <label className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-soft ring-1 ring-slate-200/80 hover:bg-slate-50">
                {busy === 'restore' ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4 text-slate-500" />} Choose a backup
                <input type="file" accept=".json,application/json" className="hidden" onChange={e => void restore(e.target.files?.[0])} />
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
