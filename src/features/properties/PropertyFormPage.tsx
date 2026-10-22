import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AirVent, Bath, Building2, Car, Dumbbell, ExternalLink, Fence, Flower2, Gamepad2, Heart, Heater, Key, Leaf, Lightbulb, Lock, ParkingCircle, ShieldCheck, Sparkles, Trash2, TreePine, Umbrella, UtensilsCrossed, Waves, Wifi, Wind, Zap } from 'lucide-react'
import { Button, buttonCls, Card, CardHeader, Empty, ErrorText, Field, inputCls, Loading, PageHeader } from '../../components/ui'
import { useUser } from '../../lib/session'
import { isManager } from '../../lib/rules'
import { CATEGORIES, CATEGORY_LABEL, PROPERTY_STATUS_LABEL, SEGMENT_LABEL, SEGMENTS } from '../../lib/labels'
import { inr } from '../../lib/format'
import type { Property, PropertyCategory, PropertySegment, PropertyStatus } from '../../lib/types'
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

const AMENITIES = [
  { key: 'Swimming pool', icon: Waves },
  { key: 'Gym', icon: Dumbbell },
  { key: 'Clubhouse', icon: UtensilsCrossed },
  { key: 'Garden', icon: Flower2 },
  { key: 'Parking', icon: ParkingCircle },
  { key: 'Security', icon: ShieldCheck },
  { key: 'CCTV', icon: Lock },
  { key: 'Power backup', icon: Zap },
  { key: 'Lift', icon: Building2 },
  { key: 'Home automation', icon: Lightbulb },
  { key: 'Wi-Fi', icon: Wifi },
  { key: 'Air conditioning', icon: AirVent },
  { key: 'Modular kitchen', icon: UtensilsCrossed },
  { key: 'Servant room', icon: Key },
  { key: 'Private pool', icon: Waves },
  { key: 'Terrace', icon: Umbrella },
  { key: 'Landscaping', icon: TreePine },
  { key: 'Jogging track', icon: Heart },
  { key: 'Kids play area', icon: Gamepad2 },
  { key: 'Rain water harvesting', icon: Leaf },
  { key: 'Car wash', icon: Car },
  { key: 'Spa', icon: Sparkles },
  { key: 'Jacuzzi', icon: Bath },
  { key: 'Covered parking', icon: Car },
  { key: 'Fence', icon: Fence },
  { key: 'Geyser', icon: Heater },
  { key: 'Cross ventilation', icon: Wind },
] as const

function AmenityPicker({ initial }: { initial: string[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initial))
  const [custom, setCustom] = useState('')
  const toggle = (k: string) => setSelected(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  const addCustom = () => { if (custom.trim()) { setSelected(s => new Set(s).add(custom.trim())); setCustom('') } }
  return (
    <Field label="Amenities" hint={`${selected.size} selected — tap to toggle`}>
      <input type="hidden" name="amenities" value={[...selected].join(', ')} />
      <div className="flex flex-wrap gap-1.5 rounded-lg bg-white p-2 shadow-soft ring-1 ring-slate-200/80">
        {AMENITIES.map(({ key, icon: I }) => (
          <button key={key} type="button" onClick={() => toggle(key)} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${selected.has(key) ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>
            <I className="size-3.5" /> {key}
          </button>
        ))}
        {[...selected].filter(s => !AMENITIES.some(a => a.key === s)).map(s => (
          <button key={s} type="button" onClick={() => toggle(s)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white">
            {s}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input value={custom} onChange={e => setCustom(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustom())} className={inputCls} placeholder="Add custom amenity" />
        <Button variant="secondary" type="button" onClick={addCustom}>Add</Button>
      </div>
    </Field>
  )
}

// ponytail: data URLs in localStorage, cap ~2MB per image. Real storage when Supabase is connected.
function readFiles(files: FileList): Promise<string[]> {
  return Promise.all(Array.from(files).map(f => new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = rej
    r.readAsDataURL(f)
  })))
}

function PropertyForm({ initial }: { initial: Property | null }) {
  const user = useUser()
  const nav = useNavigate()
  const save = useSaveProperty()
  const del = useDeleteProperty()
  const [images, setImages] = useState(initial?.images.join('\n') ?? '')
  const [price, setPrice] = useState(initial ? String(initial.price / 1e7) : '')
  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const urls = await readFiles(files)
    setImages(prev => [prev, ...urls].filter(Boolean).join('\n'))
  }

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const s = (k: string) => String(f.get(k) ?? '').trim()
    save.mutate(
      {
        id: initial?.id,
        input: {
          title: s('title'), project: s('project'), config: s('config'), area_sqft: Number(s('area_sqft')) || 0, price: Math.round(Number(price) * 1e7) || 0,
          segment: s('segment') as PropertySegment, category: s('category') as PropertyCategory,
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
              <Field label="Segment" hint="Drives the dashboard split">
                <select name="segment" defaultValue={initial?.segment ?? 'residential'} className={inputCls}>
                  {SEGMENTS.map(v => <option key={v} value={v}>{SEGMENT_LABEL[v]}</option>)}
                </select>
              </Field>
              <Field label="Type" hint="Counted per locality on the dashboard">
                <select name="category" defaultValue={initial?.category ?? 'apartment'} className={inputCls}>
                  {CATEGORIES.map(v => <option key={v} value={v}>{CATEGORY_LABEL[v]}</option>)}
                </select>
              </Field>
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
              <AmenityPicker initial={initial?.amenities ?? []} />
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
              <Field label="Upload images" hint="Select files or paste URLs below. First image is the cover.">
                <input type="file" accept="image/*" multiple onChange={e => handleFiles(e.target.files)} className={`${inputCls} py-1.5 text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-1 file:text-xs file:font-medium file:text-blue-700`} />
              </Field>
              <Field label="Image URLs" hint="One per line; uploads appear as data URLs.">
                <textarea value={images} onChange={e => setImages(e.target.value)} rows={3} className={`${inputCls} font-mono text-xs`} />
              </Field>
              <div className="grid grid-cols-3 gap-2">
                {lines(images).map((src, i) => (
                  <div key={src.slice(0, 60) + i} className="group relative">
                    <img src={src} alt="" className={`aspect-square w-full rounded-lg object-cover ring-1 ring-slate-200 ${i === 0 ? 'col-span-3 aspect-video' : ''}`} />
                    <button type="button" onClick={() => setImages(prev => lines(prev).filter((_, j) => j !== i).join('\n'))} className="absolute top-1 right-1 hidden rounded-full bg-red-600 p-1 text-white shadow group-hover:block" aria-label="Remove image">
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
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
