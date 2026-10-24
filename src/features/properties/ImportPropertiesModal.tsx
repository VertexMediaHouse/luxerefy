import { useMemo, useState, type DragEvent } from 'react'
import { AlertTriangle, Check, FileSpreadsheet, Loader2, Upload } from 'lucide-react'
import { Button, ErrorText, Modal } from '../../components/ui'
import { inr } from '../../lib/format'
import type { PropertyCategory, PropertySegment, PropertyStatus } from '../../lib/types'
import { useImportProperties, type PropertyInput } from './api'

const MAX_ROWS = 2000
const PREVIEW = 8

type SheetRow = Record<string, unknown>

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

function money(v: unknown): number | null {
  const s = String(v ?? '').trim().toLowerCase()
  if (!s) return null
  const n = parseFloat(s.replace(/,/g, '').replace(/[^\d.]/g, ''))
  if (!isFinite(n) || n <= 0) return null
  if (/cr|crore/.test(s)) return Math.round(n * 1e7)
  if (/lakh|lac|l\s*$/.test(s)) return Math.round(n * 1e5)
  return n < 1000 ? Math.round(n * 1e7) : Math.round(n)
}

function parseSegment(v: unknown): PropertySegment {
  const s = norm(String(v ?? ''))
  if (s.includes('comm')) return 'commercial'
  return 'residential'
}

function parseCategory(v: unknown): PropertyCategory {
  const s = norm(String(v ?? ''))
  if (s.includes('weekend') && s.includes('plot')) return 'weekend_plot'
  if (s.includes('weekend') || s.includes('villa')) return 'weekend_villa'
  if (s.includes('plot')) return 'plot'
  if (s.includes('bungalow') || s.includes('row')) return 'bungalow'
  return 'apartment'
}

interface ParsedPropertyRow {
  row: number
  title: string
  locality: string
  price: number
  input: PropertyInput | null
  error: string | null
}

function parsePropertyRows(rows: SheetRow[]): ParsedPropertyRow[] {
  return rows.map((r, i) => {
    const row = i + 2
    const get = (keys: string[]) => {
      for (const k of Object.keys(r)) {
        const nk = norm(k)
        if (keys.some(expected => nk === expected || nk.includes(expected))) {
          return String(r[k] ?? '').trim()
        }
      }
      return ''
    }

    const title = get(['title', 'name', 'property', 'propertyname'])
    const project = get(['project', 'society', 'building', 'developer']) || title
    const locality = get(['locality', 'area', 'location', 'address']) || 'Ahmedabad'
    const city = get(['city']) || 'Ahmedabad'
    const config = get(['configuration', 'config', 'bhk', 'type']) || '3 BHK'
    const areaSqft = parseInt(get(['area', 'areasqft', 'sqft', 'superbuildup']).replace(/[^\d]/g, '') || '1800', 10)
    const price = money(get(['price', 'cost', 'amount', 'budget', 'value'])) ?? 15000000
    const segment = parseSegment(get(['segment', 'sector']))
    const category = parseCategory(get(['category', 'propertytype', 'kind']))
    const desc = get(['description', 'details', 'notes', 'overview']) || `${config} in ${locality}, ${city}.`
    const amenitiesRaw = get(['amenities', 'features', 'facilities'])
    const amenities = amenitiesRaw ? amenitiesRaw.split(/[,;\n]+/).map(a => a.trim()).filter(Boolean) : ['Parking', 'Security', 'Lift']

    if (!title) {
      return { row, title: 'Untitled', locality, price, input: null, error: 'Property title is missing' }
    }

    const input: PropertyInput = {
      title,
      project,
      config,
      area_sqft: isNaN(areaSqft) || areaSqft <= 0 ? 1800 : areaSqft,
      price,
      segment,
      category,
      locality,
      city,
      description: desc,
      amenities,
      specs: {},
      images: [],
      status: 'available' as PropertyStatus,
      is_public: true,
    }

    return { row, title, locality, price, input, error: null }
  })
}

export function ImportPropertiesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [sheet, setSheet] = useState<SheetRow[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const imp = useImportProperties()

  const rows = useMemo(() => (sheet ? parsePropertyRows(sheet) : null), [sheet])
  const valid = rows?.filter(r => r.input) ?? []
  const bad = rows?.filter(r => !r.input) ?? []

  const reset = () => {
    setSheet(null)
    setFileName('')
    setError('')
    imp.reset()
  }

  const close = () => {
    reset()
    onClose()
  }

  async function read(file: File | undefined) {
    if (!file) return
    setError('')
    setBusy(true)
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const first = wb.SheetNames[0]
      if (!first) throw new Error('That file has no sheets in it.')
      const json = XLSX.utils.sheet_to_json<SheetRow>(wb.Sheets[first], { defval: '', raw: false })
      if (!json.length) throw new Error('That sheet has a header but no data rows under it.')
      if (json.length > MAX_ROWS) throw new Error(`That sheet has ${json.length} rows. Please split it into smaller files.`)
      setSheet(json)
      setFileName(file.name)
    } catch (e) {
      setError((e as Error).message || 'Could not parse that file.')
      setSheet(null)
    } finally {
      setBusy(false)
    }
  }

  const drop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    void read(e.dataTransfer.files[0])
  }

  return (
    <Modal open={open} onClose={close} title="Import properties from spreadsheet" wide>
      {imp.data ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-3.5 ring-1 ring-emerald-200/70">
            <Check className="mt-0.5 size-5 shrink-0 text-emerald-700" />
            <div className="text-sm text-emerald-950">
              <p className="font-semibold">Import complete</p>
              <p className="mt-0.5 text-xs text-emerald-800">
                Created <strong>{imp.data.created}</strong> new property listing{imp.data.created === 1 ? '' : 's'}.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={close}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {!sheet ? (
            <div
              onDragOver={e => { e.preventDefault(); setOver(true) }}
              onDragLeave={() => setOver(false)}
              onDrop={drop}
              className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition ${
                over ? 'border-blue-600 bg-blue-50/50' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex size-12 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <FileSpreadsheet className="size-6" />
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-900">Drag & drop your Excel or CSV file</p>
              <p className="mt-1 text-xs text-slate-500">Supports .xlsx, .xls, .csv with columns for Title, Locality, Price, etc.</p>
              <label className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800">
                <Upload className="size-3.5" />
                Browse file
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={e => void read(e.target.files?.[0])}
                />
              </label>
              {busy && <div className="mt-3 flex items-center gap-2 text-xs text-blue-600"><Loader2 className="size-3.5 animate-spin" /> Reading file...</div>}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
                <span className="font-medium text-slate-700 truncate">{fileName} ({rows?.length ?? 0} rows)</span>
                <button type="button" onClick={reset} className="font-semibold text-blue-700 hover:underline">Choose another file</button>
              </div>

              {bad.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 ring-1 ring-amber-200">
                  <AlertTriangle className="size-4 shrink-0 text-amber-600 mt-0.5" />
                  <span>{bad.length} row(s) missing required title and will be skipped.</span>
                </div>
              )}

              <div className="max-h-56 overflow-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 font-medium text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">Title</th>
                      <th className="px-3 py-2">Locality</th>
                      <th className="px-3 py-2">Price</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {rows?.slice(0, PREVIEW).map(r => (
                      <tr key={r.row} className={r.input ? '' : 'bg-red-50/50 text-red-700'}>
                        <td className="px-3 py-1.5 font-mono text-slate-400">{r.row}</td>
                        <td className="px-3 py-1.5 font-medium">{r.title}</td>
                        <td className="px-3 py-1.5 text-slate-500">{r.locality}</td>
                        <td className="px-3 py-1.5">{inr(r.price)}</td>
                        <td className="px-3 py-1.5">{r.input ? <span className="text-emerald-600 font-medium">Valid</span> : <span className="text-red-600">{r.error}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-slate-500">
                  {valid.length} valid properties ready to import
                </span>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={close}>Cancel</Button>
                  <Button
                    disabled={valid.length === 0 || imp.isPending}
                    onClick={() => {
                      const inputs = valid.map(v => v.input!).filter(Boolean)
                      imp.mutate(inputs)
                    }}
                  >
                    {imp.isPending ? 'Importing...' : `Import ${valid.length} properties`}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <ErrorText error={error || imp.error} />
        </div>
      )}
    </Modal>
  )
}
