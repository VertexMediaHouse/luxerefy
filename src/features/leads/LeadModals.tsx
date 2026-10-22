import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { CheckCircle2, Info } from 'lucide-react'
import { Button, buttonCls, ErrorText, Field, inputCls, Modal } from '../../components/ui'
import { SOURCE_LABEL } from '../../lib/labels'
import type { Lead, LeadSource } from '../../lib/types'
import { useProperties } from '../properties/api'
import { useCreateLead, useSimulate99acres } from './api'

type ModalProps = { open: boolean; onClose: () => void }

export function NewLeadModal({ open, onClose }: ModalProps) {
  return <Modal open={open} onClose={onClose} title="New lead" wide><NewLeadForm onClose={onClose} /></Modal>
}

function NewLeadForm({ onClose }: { onClose: () => void }) {
  const nav = useNavigate()
  const { data: properties = [] } = useProperties()
  const create = useCreateLead()
  const [dup, setDup] = useState<Lead | null>(null)
  const [source, setSource] = useState<LeadSource>('walk_in')
  const [picked, setPicked] = useState<string[]>([])
  const open = properties.filter(p => p.status !== 'sold')

  const toggle = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]))

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const s = (k: string) => String(f.get(k) ?? '').trim()
    const cr = (k: string) => (s(k) ? Number(s(k)) * 1e7 : null)
    const first = properties.find(p => p.id === picked[0])
    create.mutate(
      {
        name: s('name'), phone: s('phone'), email: s('email') || null, source,
        property_ids: picked,
        property_interest: s('property_interest') || (first ? `${first.config}, ${first.locality}` : null),
        budget_min: cr('budget_min'), budget_max: cr('budget_max'), city: s('city') || null,
        referral_detail: s('referral_detail') || null, notes: s('notes') || null, message: s('notes') || null,
      },
      { onSuccess: ({ lead, created }) => (created ? (onClose(), nav(`/leads/${lead.id}`)) : setDup(lead)) },
    )
  }

  if (dup) {
    return (
      <div className="space-y-4">
        <div className="flex gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-600/20">
          <Info className="size-5 shrink-0" />
          <p>This number already has an open lead. No duplicate was created; the enquiry was added to that lead's timeline.</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Link to={`/leads/${dup.id}`} onClick={onClose} className={buttonCls()}>Open lead</Link>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Full name *"><input name="name" required className={inputCls} placeholder="e.g. Rohan Mehta" /></Field>
      <Field label="Mobile *" hint="Indian numbers or +country code for NRIs"><input name="phone" required inputMode="tel" className={inputCls} placeholder="+91 98765 43210" /></Field>
      <Field label="Email"><input name="email" type="email" className={inputCls} /></Field>
      <Field label="Source">
        <select value={source} onChange={e => setSource(e.target.value as LeadSource)} className={inputCls}>
          {Object.entries(SOURCE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
      {source === 'referral' && (
        <Field label="Referred by" hint="A person or a community, so you know where it came from" className="sm:col-span-2">
          <input name="referral_detail" className={inputCls} placeholder="e.g. Kavya Shah, or Rotary Club Ahmedabad West" />
        </Field>
      )}
      <Field label="Properties" hint={picked.length ? `${picked.length} selected` : 'Tick every property they are interested in'} className="sm:col-span-2">
        <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-white p-2 shadow-soft ring-1 ring-slate-200/80">
          {open.length ? open.map(p => (
            <label key={p.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1 text-sm hover:bg-slate-50">
              <input type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} className="size-4 accent-slate-900" />
              <span className="min-w-0 flex-1 truncate text-slate-800">{p.title}</span>
              <span className="shrink-0 text-xs text-slate-400">{p.locality}</span>
            </label>
          )) : <p className="px-1.5 py-2 text-sm text-slate-400">No properties on the books yet.</p>}
        </div>
      </Field>
      <Field label="Looking for"><input name="property_interest" className={inputCls} placeholder="4 BHK in Bodakdev" /></Field>
      <Field label="City"><input name="city" className={inputCls} defaultValue="Ahmedabad" /></Field>
      <Field label="Budget from (₹ Cr)"><input name="budget_min" type="number" min="0" step="0.1" className={inputCls} /></Field>
      <Field label="Budget to (₹ Cr)"><input name="budget_max" type="number" min="0" step="0.1" className={inputCls} /></Field>
      <Field label="Notes" className="sm:col-span-2"><textarea name="notes" rows={2} className={inputCls} placeholder="Anything worth remembering" /></Field>
      <div className="flex items-center justify-end gap-3 sm:col-span-2">
        <ErrorText error={create.error} />
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={create.isPending}>Create lead</Button>
      </div>
    </form>
  )
}

const NAMES = ['Aarav Shah', 'Diya Patel', 'Kabir Mehta', 'Riya Desai', 'Vihaan Joshi', 'Anaya Trivedi', 'Reyansh Parikh']
const WANTS = ['4 BHK Sky Villa at Shela', 'penthouse in Ambli', '5 BHK bungalow in Thaltej', '4 BHK on Sindhu Bhavan Road']
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]
const randomMobile = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`
const sampleSms = () => {
  const m = randomMobile()
  return `99acres: Name: ${pick(NAMES)}, Mob: +91 ${m.slice(0, 5)} ${m.slice(5)}. I'm interested in your ${pick(WANTS)}. Please call back.`
}
const sampleJson = () => JSON.stringify({ lead_id: `99A-${Math.floor(Math.random() * 90000) + 10000}`, name: pick(NAMES), mobile: randomMobile(), email: '', project: pick(WANTS), city: 'Ahmedabad' }, null, 2)

export function SimulateWebhookModal({ open, onClose }: ModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Simulate a 99acres webhook" wide>
      <Simulate99acres onClose={onClose} />
    </Modal>
  )
}

function Simulate99acres({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState(sampleSms)
  const sim = useSimulate99acres()
  const r = sim.data

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        In production 99acres SMS or email leads are forwarded to <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">POST /functions/v1/99acres-webhook?key=•••</code>.
        Paste or edit a payload below to run the same capture logic: parse, dedupe by phone and book tomorrow's first call.
      </p>
      <div className="flex gap-2 text-xs">
        <Button variant="secondary" className="py-1 text-xs" onClick={() => { setText(sampleSms()); sim.reset() }}>Sample SMS</Button>
        <Button variant="secondary" className="py-1 text-xs" onClick={() => { setText(sampleJson()); sim.reset() }}>Sample JSON</Button>
      </div>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={6} className={`${inputCls} font-mono text-xs`} aria-label="Webhook payload" />
      <ErrorText error={sim.error} />
      {r && (
        <div className="flex gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900 ring-1 ring-emerald-600/20">
          <CheckCircle2 className="size-5 shrink-0" />
          <div>
            {r.created
              ? <p><b>New lead created.</b> A call is booked for tomorrow 10 AM.</p>
              : <p><b>Duplicate number</b>: no new lead. The enquiry was logged on the existing lead.</p>}
            <Link to={`/leads/${r.lead.id}`} onClick={onClose} className="mt-1 inline-block font-bold text-emerald-800 underline">Open lead →</Link>
          </div>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Close</Button>
        <Button onClick={() => sim.mutate(text)} disabled={sim.isPending}>Send to webhook</Button>
      </div>
    </div>
  )
}
