import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { CheckCircle2, Info } from 'lucide-react'
import { Button, buttonCls, ErrorText, Field, inputCls, Modal, Tabs } from '../../components/ui'
import { SimulateWhatsApp } from '../whatsapp/WhatsAppParts'
import { useProfiles, useUser } from '../../lib/session'
import { canSeeLead, isManager } from '../../lib/rules'
import { SOURCE_LABEL } from '../../lib/labels'
import type { Lead, LeadSource } from '../../lib/types'
import { useProperties } from '../properties/api'
import { useCreateLead, useSimulate99acres } from './api'

type ModalProps = { open: boolean; onClose: () => void }

export function NewLeadModal({ open, onClose }: ModalProps) {
  return <Modal open={open} onClose={onClose} title="New lead" wide><NewLeadForm onClose={onClose} /></Modal>
}

function NewLeadForm({ onClose }: { onClose: () => void }) {
  const user = useUser()
  const nav = useNavigate()
  const { data: properties = [] } = useProperties()
  const { data: profiles } = useProfiles()
  const create = useCreateLead()
  const [dup, setDup] = useState<Lead | null>(null)

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const s = (k: string) => String(f.get(k) ?? '').trim()
    const cr = (k: string) => (s(k) ? Number(s(k)) * 1e7 : null)
    const property = properties.find(p => p.id === s('property_id'))
    create.mutate(
      {
        name: s('name'), phone: s('phone'), email: s('email') || null, source: s('source') as LeadSource,
        property_id: property?.id ?? null, property_interest: s('property_interest') || (property ? `${property.config}, ${property.locality}` : null),
        budget_min: cr('budget_min'), budget_max: cr('budget_max'), city: s('city') || null,
        assign_to: s('assign_to') || null, message: s('message') || null,
      },
      { onSuccess: ({ lead, created }) => (created ? (onClose(), nav(`/leads/${lead.id}`)) : setDup(lead)) },
    )
  }

  if (dup) {
    const agent = profiles.find(p => p.id === dup.assigned_to)?.full_name ?? 'nobody'
    return (
      <div className="space-y-4">
        <div className="flex gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-600/20">
          <Info className="size-5 shrink-0" />
          <p>This number already has an open lead, assigned to <b>{agent}</b>. No duplicate was created; the enquiry was added to that lead's timeline.</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          {canSeeLead(user, dup) && <Link to={`/leads/${dup.id}`} onClick={onClose} className={buttonCls()}>Open lead</Link>}
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
        <select name="source" className={inputCls} defaultValue="walk_in">
          {Object.entries(SOURCE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
      <Field label="Property">
        <select name="property_id" className={inputCls} defaultValue="">
          <option value="">— Not specific —</option>
          {properties.filter(p => p.status !== 'sold').map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </Field>
      <Field label="Looking for"><input name="property_interest" className={inputCls} placeholder="4 BHK in Bodakdev" /></Field>
      <Field label="Budget from (₹ Cr)"><input name="budget_min" type="number" min="0" step="0.1" className={inputCls} /></Field>
      <Field label="Budget to (₹ Cr)"><input name="budget_max" type="number" min="0" step="0.1" className={inputCls} /></Field>
      <Field label="City"><input name="city" className={inputCls} defaultValue="Ahmedabad" /></Field>
      {isManager(user) ? (
        <Field label="Assign to" hint="Leave on auto to give it to the agent with the fewest open leads">
          <select name="assign_to" className={inputCls} defaultValue="">
            <option value="">Auto-assign</option>
            {profiles.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </Field>
      ) : <div className="self-end pb-2 text-xs text-slate-500">This lead will be assigned to you.</div>}
      <Field label="Notes" className="sm:col-span-2"><textarea name="message" rows={2} className={inputCls} /></Field>
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
  const [tab, setTab] = useState<'99acres' | 'whatsapp'>('99acres')
  return (
    <Modal open={open} onClose={onClose} title="Simulate an incoming webhook" wide>
      <div className="mb-4"><Tabs value={tab} onChange={setTab} items={[{ value: '99acres', label: '99acres lead' }, { value: 'whatsapp', label: 'WhatsApp message' }]} /></div>
      {tab === '99acres' ? <Simulate99acres onClose={onClose} /> : <SimulateWhatsApp onClose={onClose} />}
    </Modal>
  )
}

function Simulate99acres({ onClose }: { onClose: () => void }) {
  const user = useUser()
  const [text, setText] = useState(sampleSms)
  const sim = useSimulate99acres()
  const r = sim.data

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        In production 99acres SMS or email leads are forwarded to <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">POST /functions/v1/99acres-webhook?key=•••</code>.
        Paste or edit a payload below to run the same capture logic: parse, dedupe by phone, auto-assign, queue the WhatsApp template and schedule a follow-up.
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
            {r.created ? <p><b>New lead created</b> and assigned to <b>{r.agent}</b>. Follow-up template queued and a call scheduled for tomorrow 10 AM.</p>
              : <p><b>Duplicate number</b>: no new lead. The enquiry was logged on the existing lead (assigned to <b>{r.agent}</b>).</p>}
            {canSeeLead(user, r.lead) ? <Link to={`/leads/${r.lead.id}`} onClick={onClose} className="mt-1 inline-block font-bold text-emerald-800 underline">Open lead →</Link>
              : <p className="mt-1 text-emerald-800/80">It's assigned to another agent, so it isn't visible in your view.</p>}
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
