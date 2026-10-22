import { useState } from 'react'
import { Link } from 'react-router'
import { Building2, Check, Download, ExternalLink, ImageOff, Link2, Plus } from 'lucide-react'
import { Badge, Button, buttonCls, Card, Empty, Loading, PageHeader, SearchBox, Segmented, Tabs, Toolbar } from '../../components/ui'
import { CATEGORY_LABEL, PROPERTY_STATUS_LABEL, PROPERTY_STATUS_TONE, SEGMENTS, SEGMENT_LABEL } from '../../lib/labels'
import { inr } from '../../lib/format'
import type { Property, PropertySegment, PropertyStatus } from '../../lib/types'
import { shareUrl, useProperties } from './api'

export function CopyLinkButton({ slug, className = '' }: { slug: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(shareUrl(slug)) } catch { prompt('Copy this link:', shareUrl(slug)); return }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button type="button" onClick={copy} className={className}>
      {copied ? <Check className="size-4 text-emerald-600" /> : <Link2 className="size-4" />} {copied ? 'Copied' : 'Copy link'}
    </button>
  )
}

async function exportProperties(rows: Property[]) {
  const XLSX = await import('xlsx')
  const data = rows.map(p => ({
    Title: p.title, Project: p.project, Configuration: p.config, 'Area (sq ft)': p.area_sqft,
    'Price (₹)': p.price, Segment: SEGMENT_LABEL[p.segment], Type: CATEGORY_LABEL[p.category],
    Locality: p.locality, City: p.city, Status: PROPERTY_STATUS_LABEL[p.status],
    Amenities: p.amenities.join(', '), Public: p.is_public ? 'Yes' : 'No',
  }))
  const ws = XLSX.utils.json_to_sheet(data)
  // ponytail: simple column widths, Poppins in the real export once Excel rendering supports it
  ws['!cols'] = Object.keys(data[0] || {}).map(() => ({ wch: 18 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Properties')
  XLSX.writeFile(wb, `luxerefy-properties-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export function PropertiesPage() {
  const { data } = useProperties()
  const [status, setStatus] = useState<PropertyStatus | 'all'>('all')
  const [segment, setSegment] = useState<PropertySegment>('residential')
  const [showSold, setShowSold] = useState(false)
  const [q, setQ] = useState('')
  if (!data) return <Loading />

  const needle = q.toLowerCase()
  const base = data
    .filter(p => p.segment === segment)
    .filter(p => showSold || p.status !== 'sold')
    .filter(p => !needle || [p.title, p.locality, p.config, p.project].some(v => v.toLowerCase().includes(needle)))
  const rows = status === 'all' ? base : base.filter(p => p.status === status)

  return (
    <>
      <PageHeader icon={Building2} title="Properties" subtitle="One record per property, with a shareable page for clients" actions={<>
        <Button variant="secondary" onClick={() => void exportProperties(rows)}><Download className="size-4" /> Export</Button>
        <Link to="/properties/new" className={buttonCls()}><Plus className="size-4" /> New property</Link>
      </>} />

      <Card className="mb-5 [&>div]:border-0">
        <Toolbar>
          <div className="flex flex-wrap items-center gap-3">
            <Segmented label="Segment" value={segment} onChange={setSegment} items={SEGMENTS.map(s => ({ value: s, label: SEGMENT_LABEL[s] }))} />
            <Tabs value={status} onChange={setStatus} items={[
              { value: 'all', label: 'All', count: base.length },
              ...(['available', 'reserved', 'sold'] as const).filter(s => showSold || s !== 'sold').map(s => ({ value: s, label: PROPERTY_STATUS_LABEL[s], count: base.filter(p => p.status === s).length })),
            ]} />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={showSold} onChange={e => setShowSold(e.target.checked)} className="size-3.5 accent-blue-600" />
              Show sold
            </label>
            <SearchBox value={q} onChange={setQ} placeholder="Search title, locality, BHK" label="Search properties" className="lg:w-72" />
          </div>
        </Toolbar>
      </Card>
      {rows.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{rows.map(p => <PropertyCard key={p.id} p={p} />)}</div>
      ) : <Card><Empty icon={Building2}>No properties match.</Empty></Card>}
    </>
  )
}

function PropertyCard({ p }: { p: Property }) {
  return (
    <Card className="group flex flex-col">
      <Link to={`/properties/${p.id}`} className="block flex-1">
        <div className="relative aspect-[16/10] overflow-hidden rounded-t-[11px] bg-slate-100">
          {p.images[0]
            ? <img src={p.images[0]} alt="" loading="lazy" className="size-full object-cover" />
            : <div className="flex size-full items-center justify-center text-slate-300"><ImageOff className="size-6" /></div>}
          <div className="absolute top-2.5 left-2.5 flex gap-1.5">
            <Badge tone={PROPERTY_STATUS_TONE[p.status]}>{PROPERTY_STATUS_LABEL[p.status]}</Badge>
            {!p.is_public && <Badge>Draft</Badge>}
          </div>
          {p.images.length > 1 && <span className="absolute right-2.5 bottom-2.5 rounded bg-black/50 px-1.5 py-0.5 text-[11px] font-medium text-white">{p.images.length}</span>}
        </div>
        <div className="px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="min-w-0 truncate text-sm font-semibold text-slate-900">{p.title}</h3>
            <p className="shrink-0 text-sm font-semibold text-slate-900">{inr(p.price)}</p>
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-500">{p.locality} · {p.config} · {p.area_sqft.toLocaleString('en-IN')} sq ft</p>
          <p className="mt-0.5 text-xs text-slate-400">{CATEGORY_LABEL[p.category]}</p>
        </div>
      </Link>
      <div className="flex divide-x divide-slate-100 border-t border-slate-100 text-xs font-medium">
        {p.is_public ? (
          <>
            <CopyLinkButton slug={p.slug} className="flex flex-1 items-center justify-center gap-1.5 py-2 text-slate-500 hover:text-slate-900" />
            <a href={`/p/${p.slug}`} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-1.5 py-2 text-slate-500 hover:text-slate-900"><ExternalLink className="size-3.5" /> Preview</a>
          </>
        ) : <span className="flex-1 py-2 text-center text-slate-400">Not public</span>}
      </div>
    </Card>
  )
}
