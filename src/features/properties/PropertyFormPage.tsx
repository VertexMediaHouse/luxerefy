import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Building2, ExternalLink, Trash2 } from 'lucide-react'
import { Button, buttonCls, Card, CardHeader, Empty, ErrorText, Field, inputCls, Loading, PageHeader } from '../../components/ui'
import { useUser } from '../../lib/session'
import { isManager } from '../../lib/rules'
import { PROPERTY_STATUS_LABEL } from '../../lib/labels'
import { inr } from '../../lib/format'
import type { Property, PropertyStatus } from '../../lib/types'
import { shareUrl, useDeleteProperty, useProperty, useSaveProperty } from './api'
import { CopyLinkButton } from './PropertiesPage'
import { DocumentsPanel } from '../documents/DocumentParts'

export function PropertyFormPage() {
  const { id } = useParams()
  const { data, isLoading } = useProperty(id)
  if (id && isLoading) return <Loading />
  if (id && !data) return <Card><Empty icon={Building2}>Property not found. <Link to="/properties" className="font-semibold text-blue-700">Back</Link></Empty></Card>
  return <PropertyForm key={id ?? 'new'} initial={data ?? null} />
}

const lines = (s: string) => s.split('\n').map(l => l.trim()).filter(Boolean)

function PropertyForm({ initial }: { initial: Property | null }) {
  const user = useUser()
  const nav = useNavigate()
  const save = useSaveProperty()
  const del = useDeleteProperty()
  const [images, setImages] = useState(initial?.images.join('\n') ?? '')
  const [price, setPrice] = useState(initial ? String(initial.price / 1e7) : '')

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const s = (k: string) => String(f.get(k) ?? '').trim()
    save.mutate(
      {
        id: initial?.id,
        input: {
          title: s('title'), project: s('project'), config: s('config'), area_sqft: Number(s('area_sqft')) || 0, price: Math.round(Number(price) * 1e7) || 0,
          locality: s('locality'), city: s('city') || 'Ahmedabad', description: s('description'),
          amenities: s('amenities').split(',').map(a => a.trim()).filter(Boolean),
          specs: Object.fromEntries(lines(s('specs')).filter(l => l.includes(':')).map(l => [l.slice(0, l.indexOf(':')).trim(), l.slice(l.indexOf(':') + 1).trim()])),
          images: lines(images), status: s('status') as PropertyStatus, is_public: f.get('is_public') === 'on',
        },
      },
      { onSuccess: p => !initial && nav(`/properties/${p.id}`, { replace: true }) },
    )
  }

  const remove = () => initial && confirm(`Delete "${initial.title}"? Leads linked to it keep their history.`) && del.mutate(initial.id, { onSuccess: () => nav('/properties') })

  return (
    <>
    <form onSubmit={submit}>
      <PageHeader
        back={{ to: '/properties', label: 'Properties' }}
        title={initial ? initial.title : 'New property'}
        subtitle={initial ? `${initial.locality}, ${initial.config}` : 'Add a listing; tick "Public" to get a shareable link'}
        actions={<>
          {initial && isManager(user) && <Button variant="danger" onClick={remove}><Trash2 className="size-4" /> Delete</Button>}
          {initial?.is_public && <a href={`/p/${initial.slug}`} target="_blank" rel="noreferrer" className={buttonCls('secondary')}><ExternalLink className="size-4" /> Public page</a>}
          <Button type="submit" disabled={save.isPending}>{save.isSuccess && initial ? 'Saved ✓' : 'Save property'}</Button>
        </>}
      />
      <div className="mb-4"><ErrorText error={save.error ?? del.error} /></div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Basics" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Title *" className="sm:col-span-2"><input name="title" required defaultValue={initial?.title} className={inputCls} placeholder="Aurelia Sky Villa" /></Field>
              <Field label="Project / society"><input name="project" defaultValue={initial?.project} className={inputCls} /></Field>
              <Field label="Configuration"><input name="config" defaultValue={initial?.config} className={inputCls} placeholder="4 BHK Penthouse" /></Field>
              <Field label="Price (₹ Cr)" hint={Number(price) > 0 ? inr(Number(price) * 1e7) : undefined}><input type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} className={inputCls} /></Field>
              <Field label="Carpet area (sq ft)"><input name="area_sqft" type="number" min="0" defaultValue={initial?.area_sqft} className={inputCls} /></Field>
              <Field label="Locality"><input name="locality" defaultValue={initial?.locality} className={inputCls} placeholder="Shela" /></Field>
              <Field label="City"><input name="city" defaultValue={initial?.city ?? 'Ahmedabad'} className={inputCls} /></Field>
            </div>
          </Card>
          <Card>
            <CardHeader title="Description & amenities" />
            <div className="space-y-4 p-5">
              <Field label="Description"><textarea name="description" rows={4} defaultValue={initial?.description} className={inputCls} /></Field>
              <Field label="Amenities" hint="Comma separated"><textarea name="amenities" rows={2} defaultValue={initial?.amenities.join(', ')} className={inputCls} placeholder="Private pool, Clubhouse, Home automation" /></Field>
              <Field label="Specifications" hint="One per line, as Label: value">
                <textarea name="specs" rows={5} defaultValue={Object.entries(initial?.specs ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n')} className={`${inputCls} font-mono text-xs`} placeholder={'Possession: Ready to move\nFacing: East'} />
              </Field>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Listing" />
            <div className="space-y-4 p-5">
              <Field label="Status">
                <select name="status" defaultValue={initial?.status ?? 'available'} className={inputCls}>
                  {Object.entries(PROPERTY_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
              <label className="flex items-start gap-3 rounded-lg bg-slate-50 p-3">
                <input name="is_public" type="checkbox" defaultChecked={initial?.is_public} className="mt-0.5 size-4 accent-blue-600" />
                <span className="text-sm"><span className="block font-semibold text-slate-800">Public</span><span className="text-slate-500">Anyone with the link can view it and enquire.</span></span>
              </label>
              {initial?.is_public && (
                <div className="space-y-2">
                  <input readOnly value={shareUrl(initial.slug)} className={`${inputCls} bg-slate-50 text-xs`} aria-label="Share link" onFocus={e => e.target.select()} />
                  <CopyLinkButton slug={initial.slug} className={`${buttonCls('secondary')} w-full`} />
                </div>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="Images" />
            <div className="space-y-3 p-5">
              <Field label="Image URLs" hint="One per line; the first is the cover. Uploads go to Supabase Storage once connected.">
                <textarea value={images} onChange={e => setImages(e.target.value)} rows={4} className={`${inputCls} font-mono text-xs`} />
              </Field>
              <div className="grid grid-cols-3 gap-2">
                {lines(images).map((src, i) => <img key={src + i} src={src} alt="" className={`aspect-square w-full rounded-lg object-cover ring-1 ring-slate-200 ${i === 0 ? 'col-span-3 aspect-video' : ''}`} />)}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </form>
    {initial && <div className="mt-6 lg:w-2/3"><DocumentsPanel propertyId={initial.id} /></div>}
    </>
  )
}
