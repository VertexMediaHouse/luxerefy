import { useState } from 'react'
import { Link } from 'react-router'
import { Building2, Check, ExternalLink, ImageOff, Images, Link2, MapPin, Plus } from 'lucide-react'
import { Badge, buttonCls, Card, Empty, Loading, PageHeader, SearchBox, Tabs, Toolbar } from '../../components/ui'
import { PROPERTY_STATUS_LABEL, PROPERTY_STATUS_TONE } from '../../lib/labels'
import { inr } from '../../lib/format'
import type { Property, PropertyStatus } from '../../lib/types'
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

export function PropertiesPage() {
  const { data } = useProperties()
  const [status, setStatus] = useState<PropertyStatus | 'all'>('all')
  const [q, setQ] = useState('')
  if (!data) return <Loading />

  const needle = q.toLowerCase()
  const base = data.filter(p => !needle || [p.title, p.locality, p.config, p.project].some(v => v.toLowerCase().includes(needle)))
  const rows = status === 'all' ? base : base.filter(p => p.status === status)

  return (
    <>
      <PageHeader icon={Building2} title="Properties" subtitle="One record per property, with a shareable page for clients" actions={<Link to="/properties/new" className={buttonCls()}><Plus className="size-4" /> New property</Link>} />
      <Card className="mb-5 [&>div]:border-0">
        <Toolbar>
        <Tabs value={status} onChange={setStatus} items={[
          { value: 'all', label: 'All', count: base.length },
          ...(['available', 'reserved', 'sold'] as const).map(s => ({ value: s, label: PROPERTY_STATUS_LABEL[s], count: base.filter(p => p.status === s).length })),
        ]} />
        <SearchBox value={q} onChange={setQ} placeholder="Search title, locality, BHK" label="Search properties" className="lg:w-72" />
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
    <Card className="group flex flex-col transition hover:shadow-lift">
      <Link to={`/properties/${p.id}`} className="block flex-1">
        <div className="relative aspect-[16/10] overflow-hidden rounded-t-xl bg-gradient-to-br from-slate-100 to-slate-200">
          {p.images[0]
            ? <img src={p.images[0]} alt="" loading="lazy" className="size-full object-cover" />
            : <div className="flex size-full items-center justify-center text-slate-300"><ImageOff className="size-8" /></div>}
          <div className="absolute top-3 left-3 flex gap-1.5">
            <Badge tone={PROPERTY_STATUS_TONE[p.status]}>{PROPERTY_STATUS_LABEL[p.status]}</Badge>
            {!p.is_public && <Badge>Draft</Badge>}
          </div>
          <span className="absolute right-3 bottom-3 inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 text-xs font-medium text-white backdrop-blur"><Images className="size-3.5" /> {p.images.length}</span>
        </div>
        <div className="px-4 py-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="min-w-0 truncate font-semibold text-slate-900">{p.title}</h3>
            <p className="shrink-0 font-semibold text-slate-900">{inr(p.price)}</p>
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500"><MapPin className="size-3.5 shrink-0" /> <span className="truncate">{p.locality}, {p.config}, {p.area_sqft.toLocaleString('en-IN')} sq ft</span></p>
        </div>
      </Link>
      <div className="flex divide-x divide-slate-100 border-t border-slate-100 text-xs font-medium">
        {p.is_public ? (
          <>
            <CopyLinkButton slug={p.slug} className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-slate-600 hover:bg-slate-50 hover:text-blue-700" />
            <a href={`/p/${p.slug}`} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-slate-600 hover:bg-slate-50 hover:text-blue-700"><ExternalLink className="size-4" /> Preview</a>
          </>
        ) : <span className="flex-1 py-2.5 text-center text-slate-400">Not shared publicly</span>}
      </div>
    </Card>
  )
}
