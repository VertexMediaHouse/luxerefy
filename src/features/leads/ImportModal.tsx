import { useMemo, useState, type DragEvent } from 'react'
import { AlertTriangle, Check, FileSpreadsheet, Loader2, Upload } from 'lucide-react'
import { Button, ErrorText, Field, Modal, T, inlineInputCls } from '../../components/ui'
import { budget } from '../../lib/format'
import { SOURCE_LABEL } from '../../lib/labels'
import { mapHeaders, parseRows, type Field as SheetField, type SheetRow } from './importSheet'
import { useImportLeads } from './api'
import { usePipelines } from '../pipeline/api'

/** A sheet is read in the browser, so cap it rather than freezing the tab on a 50k-row export. */
const MAX_ROWS = 2000
const PREVIEW = 8

const COLUMNS: [SheetField, string][] = [
  ['name', 'Name'], ['phone', 'Phone'], ['email', 'Email'], ['city', 'City'],
  ['property_interest', 'Interest'], ['budget', 'Budget'], ['source', 'Source'], ['notes', 'Notes'],
]

export function ImportLeadsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: pipes } = usePipelines()
  const [sheet, setSheet] = useState<SheetRow[] | null>(null)
  const [name, setName] = useState('')
  const [pipelineId, setPipelineId] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const imp = useImportLeads()

  const pid = pipelineId || pipes?.[0]?.id || ''
  const rows = useMemo(() => (sheet ? parseRows(sheet, pid) : null), [sheet, pid])
  const found = useMemo(() => (sheet ? mapHeaders([...new Set(sheet.flatMap(Object.keys))]) : {}), [sheet])
  const valid = rows?.filter(r => r.input) ?? []
  const bad = rows?.filter(r => !r.input) ?? []

  const reset = () => { setSheet(null); setName(''); setError(''); imp.reset() }
  const close = () => { reset(); onClose() }

  async function read(file: File | undefined) {
    if (!file) return
    setError('')
    setBusy(true)
    try {
      // Dynamic import keeps the spreadsheet parser out of the main bundle.
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const first = wb.SheetNames[0]
      if (!first) throw new Error('That file has no sheets in it.')
      // raw:false gives us the formatted text, so "2.5 Cr" survives as written.
      const json = XLSX.utils.sheet_to_json<SheetRow>(wb.Sheets[first], { defval: '', raw: false })
      if (!json.length) throw new Error('That sheet has a header but no rows under it.')
      if (json.length > MAX_ROWS) throw new Error(`That sheet has ${json.length} rows. Split it into files of ${MAX_ROWS} or fewer.`)
      const headers = mapHeaders([...new Set(json.flatMap(Object.keys))])
      if (!headers.phone) throw new Error('No phone column found. Name one of the columns Phone or Mobile.')
      setSheet(json)
      setName(file.name)
    } catch (e) {
      setError((e as Error).message || 'Could not read that file.')
      setSheet(null)
    } finally {
      setBusy(false)
    }
  }

  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); void read(e.dataTransfer.files[0]) }

  return (
    <Modal open={open} onClose={close} title="Import leads from a spreadsheet" wide>
      {imp.data ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-3.5 ring-1 ring-emerald-200/70">
            <Check className="mt-0.5 size-5 shrink-0 text-emerald-600" />
            <div className="text-sm text-slate-700">
              <p className="font-medium text-slate-900">{imp.data.created} {imp.data.created === 1 ? 'lead' : 'leads'} created</p>
              <p className="mt-0.5 text-slate-600">
                {imp.data.merged > 0 && <>{imp.data.merged} merged into an existing open lead. </>}
                {bad.length > 0 && <>{bad.length} {bad.length === 1 ? 'row' : 'rows'} skipped. </>}
                They all landed on the entry stage of the selected pipeline.
              </p>
            </div>
          </div>
          {imp.data.failed.length > 0 && (
            <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-red-600">
              {imp.data.failed.map(f => <li key={f.row}>Row {f.row}: {f.error}</li>)}
            </ul>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={reset}>Import another</Button>
            <Button onClick={close}>Done</Button>
          </div>
        </div>
      ) : !rows ? (
        <div className="space-y-4">
          <label
            onDragOver={e => { e.preventDefault(); setOver(true) }}
            onDragLeave={() => setOver(false)}
            onDrop={drop}
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
              over ? 'border-slate-400 bg-slate-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/70'
            }`}
          >
            {busy
              ? <Loader2 className="size-6 animate-spin text-slate-400" />
              : <Upload className="size-6 text-slate-400" />}
            <span className="text-sm font-medium text-slate-700">{busy ? 'Reading the sheet…' : 'Drop an Excel or CSV file here'}</span>
            <span className="text-xs text-slate-400">.xlsx, .xls or .csv — or click to choose one</span>
            <input type="file" accept=".xlsx,.xls,.csv,text/csv" className="hidden" onChange={e => void read(e.target.files?.[0])} />
          </label>

          {error && <p className="flex items-start gap-2 text-sm text-red-600"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}</p>}

          <p className="text-xs leading-relaxed text-slate-500">
            The first sheet is read and the header row is matched automatically. Recognised columns:{' '}
            <span className="text-slate-700">Name, Phone, Email, City, Interest, Budget, Source, Notes</span>. Only Phone is required.
            Budgets may be written as <span className="text-slate-700">2.5 Cr</span>, <span className="text-slate-700">85 L</span> or <span className="text-slate-700">2 – 3 Cr</span>.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex min-w-0 items-center gap-2 text-sm text-slate-700">
              <FileSpreadsheet className="size-4 shrink-0 text-emerald-600" /> <span className="truncate font-medium">{name}</span>
            </span>
            <button type="button" onClick={reset} className="text-xs font-medium text-slate-500 underline hover:text-slate-900">Choose another</button>
            {(pipes?.length ?? 0) > 1 && (
              <Field label="" className="ml-auto">
                <select value={pid} onChange={e => setPipelineId(e.target.value)} className={inlineInputCls} aria-label="Import into pipeline">
                  {pipes?.map(p => <option key={p.id} value={p.id}>Into {p.name}</option>)}
                </select>
              </Field>
            )}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span className="font-medium text-slate-900">{valid.length} ready</span>
            {bad.length > 0 && <span className="text-amber-700">{bad.length} will be skipped</span>}
            <span className="text-slate-400">
              Matched: {COLUMNS.filter(([f]) => found[f]).map(([, l]) => l).join(', ') || 'nothing'}
            </span>
          </div>

          <div className="max-h-64 overflow-auto rounded-xl ring-1 ring-slate-200">
            <table className={T.table}>
              <thead className={T.head}>
                <tr>
                  <th className={T.th}>Row</th>
                  <th className={T.th}>Name</th>
                  <th className={T.th}>Phone</th>
                  <th className={`${T.th} hidden sm:table-cell`}>Budget</th>
                  <th className={`${T.th} hidden sm:table-cell`}>Source</th>
                </tr>
              </thead>
              <tbody className={T.body}>
                {rows.slice(0, PREVIEW).map(r => (
                  <tr key={r.row} className={r.error ? 'bg-red-50/50' : undefined}>
                    <td className={`${T.td} text-slate-400 tabular-nums`}>{r.row}</td>
                    <td className={`${T.td} font-medium text-slate-800`}>{r.name || <span className="text-slate-400">—</span>}</td>
                    <td className={T.td}>
                      {r.error
                        ? <span className="text-red-600">{r.phone || '—'} — {r.error}</span>
                        : <span className="text-slate-600 tabular-nums">{r.phone}</span>}
                    </td>
                    <td className={`${T.td} hidden whitespace-nowrap text-slate-600 sm:table-cell`}>{r.input ? budget(r.input.budget_min ?? null, r.input.budget_max ?? null) : '—'}</td>
                    <td className={`${T.td} hidden text-slate-600 sm:table-cell`}>{r.input ? SOURCE_LABEL[r.input.source] : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > PREVIEW && <p className="px-4 py-2 text-xs text-slate-400">…and {rows.length - PREVIEW} more rows</p>}
          </div>

          <ErrorText error={imp.error} />

          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button
              disabled={!valid.length || imp.isPending}
              onClick={() => imp.mutate(valid.map(r => r.input!))}
            >
              {imp.isPending ? <><Loader2 className="size-4 animate-spin" /> Importing…</> : <>Import {valid.length} {valid.length === 1 ? 'lead' : 'leads'}</>}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
