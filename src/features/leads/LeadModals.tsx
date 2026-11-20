import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Info } from 'lucide-react'
import { Button, buttonCls, ErrorText, Field, inputCls, Modal } from '../../components/ui'
import { LEAD_TYPES, LEAD_TYPE_LABEL, SOURCE_LABEL } from '../../lib/labels'
import type { Lead, LeadSource, LeadType } from '../../lib/types'
import { useProperties } from '../properties/api'
import { useCreateLead } from './api'
import { useBase, useUser } from '../../lib/session'
import { isManager } from '../../lib/rules'

type ModalProps = { open: boolean; onClose: () => void; assignTo?: string; base?: string }

export function NewLeadModal({ open, onClose, assignTo, base }: ModalProps) {
  const user = useUser()
  const root = useBase()
  assignTo ??= isManager(user) ? undefined : user.id
  base ??= `${root}/leads`
  return <Modal open={open} onClose={onClose} title="New lead" wide><NewLeadForm onClose={onClose} assignTo={assignTo} base={base} /></Modal>
}

function NewLeadForm({ onClose, assignTo, base }: { onClose: () => void; assignTo?: string; base: string }) {
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
        assigned_to: assignTo ?? null,
        property_ids: picked,
        property_interest: s('property_interest') || (first ? `${first.config}, ${first.locality}` : null),
        locality: s('locality') || (first ? first.locality : null),
        project: s('project') || (first ? first.project : null),
        lead_type: (s('lead_type') as LeadType) || null,
        budget_min: cr('budget_min'), budget_max: cr('budget_max'), city: s('city') || null,
        referral_detail: s('referral_detail') || null, notes: s('notes') || null, message: s('notes') || null,
      },
      { onSuccess: ({ lead, created }) => (created ? (onClose(), nav(`${base}/${lead.id}`)) : setDup(lead)) },
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
          <Link to={`${base}/${dup.id}`} onClick={onClose} className={buttonCls()}>Open lead</Link>
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
      <Field label="Locality"><input name="locality" className={inputCls} placeholder="e.g. Prahlad Nagar" /></Field>
      <Field label="Project"><input name="project" className={inputCls} placeholder="e.g. Aurelia Residences" /></Field>
      <Field label="Type">
        <select name="lead_type" className={inputCls}>
          <option value="">Select type...</option>
          {LEAD_TYPES.map(t => (
            <option key={t} value={t}>{LEAD_TYPE_LABEL[t]}</option>
          ))}
        </select>
      </Field>
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

