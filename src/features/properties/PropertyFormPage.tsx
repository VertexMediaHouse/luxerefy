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

/** Spec keys owned by structured form fields; kept out of the free-form specs textarea. */
const STRUCTURED_SPECS = ['Area unit', 'Built-up area', 'Super built-up area', 'Furnishing', 'Other rooms', 'Covered parking', 'Open parking', 'Total floors', 'On floor', 'Duplex', 'Availability', 'Price negotiable', 'Brokerage', 'Brokerage negotiable', 'Video']
const OTHER_ROOMS = ['Pooja Room', 'Study Room', 'Servant Room', 'Store Room']

function PropertyForm({ initial }: { initial: Property | null }) {
  const user = useUser()
  const nav = useNavigate()
  const save = useSaveProperty()
  const del = useDeleteProperty()
  const [images, setImages] = useState(initial?.images.join('\n') ?? '')
  const [price, setPrice] = useState(initial ? String(initial.price / 1e7) : '')
  const sp = (k: string) => initial?.specs[k] ?? ''
  const spNum = (k: string) => sp(k).replace(/[^\d.]/g, '')
  const [areaUnit, setAreaUnit] = useState(initial?.specs['Area unit'] === 'sq yd' ? 'sq yd' : 'sq ft')
  const [brokerageType, setBrokerageType] = useState(!initial?.specs['Brokerage'] ? '' : initial.specs['Brokerage'].includes('%') ? 'percent' : 'fixed')
  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const urls = await readFiles(files)
    setImages(prev => [prev, ...urls].filter(Boolean).join('\n'))
  }

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const s = (k: string) => String(f.get(k) ?? '').trim()
    const structured: Record<string, string> = {}
    const set = (k: string, v: string) => { if (v) structured[k] = v }
    structured['Area unit'] = areaUnit
    set('Built-up area', s('builtup') && `${s('builtup')} ${areaUnit}`)
    set('Super built-up area', s('super_builtup') && `${s('super_builtup')} ${areaUnit}`)
    set('Furnishing', s('furnishing'))
    set('Other rooms', f.getAll('other_rooms').map(String).join(', '))
    set('Covered parking', s('covered_parking'))
    set('Open parking', s('open_parking'))
    set('Total floors', s('total_floors'))
    set('On floor', s('on_floor'))
    if (f.get('duplex') === 'on') structured['Duplex'] = 'Yes'
    set('Availability', s('availability'))
    if (f.get('price_negotiable') === 'on') structured['Price negotiable'] = 'Yes'
    set('Brokerage', s('brokerage_amount') && (s('brokerage_type') === 'percent' ? `${s('brokerage_amount')}% of price` : `₹${s('brokerage_amount')}`))
    if (f.get('brokerage_negotiable') === 'on') structured['Brokerage negotiable'] = 'Yes'
    set('Video', s('video'))
    save.mutate(
      {
        id: initial?.id,
        input: {
          title: s('title'), project: s('project'), config: s('config'), area_sqft: Number(s('area_sqft')) || 0, price: Math.round(Number(price) * 1e7) || 0,
          segment: s('segment') as PropertySegment, category: s('category') as PropertyCategory,
          locality: s('locality'), city: s('city') || 'Ahmedabad', description: s('description'),
          amenities: s('amenities').split(',').map(a => a.trim()).filter(Boolean),
          specs: { ...Object.fromEntries(lines(s('specs')).filter(l => l.includes(':')).map(l => [l.slice(0, l.indexOf(':')).trim(), l.slice(l.indexOf(':') + 1).trim()])), ...structured },
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
              <Field label="Area unit">
                <select value={areaUnit} onChange={e => setAreaUnit(e.target.value)} className={inputCls}>
                  <option value="sq ft">Sq. feet</option>
                  <option value="sq yd">Sq. yards</option>
                </select>
              </Field>
              <Field label={`Carpet area (${areaUnit})`}><input name="area_sqft" type="number" min="0" defaultValue={initial?.area_sqft} className={inputCls} /></Field>
              <Field label={`Built-up area (${areaUnit})`}><input name="builtup" type="number" min="0" defaultValue={spNum('Built-up area')} className={inputCls} /></Field>
              <Field label={`Super built-up area (${areaUnit})`}><input name="super_builtup" type="number" min="0" defaultValue={spNum('Super built-up area')} className={inputCls} /></Field>
              <Field label="Locality"><input name="locality" defaultValue={initial?.locality} className={inputCls} placeholder="Shela" /></Field>
              <Field label="City"><input name="city" defaultValue={initial?.city ?? 'Ahmedabad'} className={inputCls} /></Field>
              <div className="space-y-4 rounded-lg bg-slate-50 p-4 sm:col-span-2">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input name="price_negotiable" type="checkbox" defaultChecked={!!sp('Price negotiable')} className="size-4 accent-blue-600" /> Price is negotiable
                </label>
                <div>
                  <span className="mb-2 block text-sm font-medium text-slate-700">Do you charge brokerage?</span>
                  <input type="hidden" name="brokerage_type" value={brokerageType} />
                  <div className="flex flex-wrap items-center gap-2">
                    {([['', 'No'], ['percent', '% of price'], ['fixed', 'Fixed ₹']] as const).map(([v, l]) => (
                      <button key={v} type="button" onClick={() => setBrokerageType(v)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${brokerageType === v ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'}`}>
                        {l}
                      </button>
                    ))}
                    {brokerageType && (<>
                      <input name="brokerage_amount" type="number" min="0" step="0.01" defaultValue={spNum('Brokerage')} className={`${inputCls} w-28`} placeholder={brokerageType === 'percent' ? '1' : '50000'} />
                      <label className="flex items-center gap-2 text-sm text-slate-600">
                        <input name="brokerage_negotiable" type="checkbox" defaultChecked={!!sp('Brokerage negotiable')} className="size-4 accent-blue-600" /> Negotiable
                      </label>
                    </>)}
                  </div>
                </div>
              </div>
            </div>
          </Card>
          <Card>
            <CardHeader title="Property details" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Furnishing">
                <select name="furnishing" defaultValue={sp('Furnishing')} className={inputCls}>
                  {['', 'Furnished', 'Semi-furnished', 'Un-furnished'].map(v => <option key={v} value={v}>{v || '—'}</option>)}
                </select>
              </Field>
              <Field label="Availability">
                <select name="availability" defaultValue={sp('Availability')} className={inputCls}>
                  {['', 'Ready to move', 'Under construction'].map(v => <option key={v} value={v}>{v || '—'}</option>)}
                </select>
              </Field>
              <Field label="Covered parking"><input name="covered_parking" type="number" min="0" defaultValue={spNum('Covered parking')} className={inputCls} /></Field>
              <Field label="Open parking"><input name="open_parking" type="number" min="0" defaultValue={spNum('Open parking')} className={inputCls} /></Field>
              <Field label="Total floors in building"><input name="total_floors" type="number" min="0" defaultValue={spNum('Total floors')} className={inputCls} /></Field>
              <Field label="Property on floor"><input name="on_floor" defaultValue={sp('On floor')} className={inputCls} placeholder="3, or Ground" /></Field>
              <Field label="Other rooms" className="sm:col-span-2">
                <div className="flex flex-wrap gap-2">
                  {OTHER_ROOMS.map(r => (
                    <label key={r} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600">
                      <input type="checkbox" name="other_rooms" value={r} defaultChecked={sp('Other rooms').includes(r)} className="size-3.5 accent-blue-600" /> {r}
                    </label>
                  ))}
                </div>
              </Field>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 sm:col-span-2">
                <input name="duplex" type="checkbox" defaultChecked={!!sp('Duplex')} className="size-4 accent-blue-600" /> This property is a duplex
              </label>
            </div>
          </Card>
          <Card>
            <CardHeader title="Description & amenities" />
            <div className="space-y-4 p-5">
              <Field label="Description"><textarea name="description" rows={4} defaultValue={initial?.description} className={inputCls} /></Field>
              <AmenityPicker initial={initial?.amenities ?? []} />
              <Field label="Specifications" hint="One per line, as Label: value">
                <textarea name="specs" rows={5} defaultValue={Object.entries(initial?.specs ?? {}).filter(([k]) => !STRUCTURED_SPECS.includes(k)).map(([k, v]) => `${k}: ${v}`).join('\n')} className={`${inputCls} font-mono text-xs`} placeholder={'Facing: East\nAge of property: 2 years'} />
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
            <CardHeader title="Media" />
            <div className="space-y-3 p-5">
              <Field label="YouTube video link"><input name="video" type="url" defaultValue={sp('Video')} className={inputCls} placeholder="https://youtube.com/watch?v=…" /></Field>
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
