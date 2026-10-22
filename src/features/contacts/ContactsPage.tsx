import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Contact2, Plus } from 'lucide-react'
import { Avatar, Badge, Button, Card, Empty, ErrorText, Field, inputCls, Loading, Modal, PageHeader, RecordCount, SearchBox, T, Tabs, Toolbar, StageChip } from '../../components/ui'
import { type Tone } from '../../lib/labels'
import { prettyPhone } from '../../lib/format'
import type { Contact } from '../../lib/types'
import { useContacts, useSaveContact } from './api'

export const KIND_LABEL: Record<Contact['kind'], string> = { client: 'Client', lead: 'Lead', vendor: 'Vendor' }
export const KIND_TONE: Record<Contact['kind'], Tone> = { client: 'green', lead: 'blue', vendor: 'violet' }

export function ContactsPage() {
  const { data } = useContacts()
  const [kind, setKind] = useState<Contact['kind'] | 'all'>('all')
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const nav = useNavigate()
  if (!data) return <Loading />

  const needle = q.toLowerCase().replace(/\s/g, '')
  const base = data.filter(c => !needle || c.name.toLowerCase().replace(/\s/g, '').includes(needle) || c.phone.includes(needle) || c.email?.toLowerCase().includes(needle))
  const rows = kind === 'all' ? base : base.filter(c => c.kind === kind)

  return (
    <>
      <PageHeader icon={Contact2} title="Contacts" subtitle="Clients, leads and vendors in one searchable list" actions={<Button onClick={() => setAdding(true)}><Plus className="size-4" /> New contact</Button>} />
      <Card>
        <Toolbar>
          <Tabs value={kind} onChange={setKind} items={[
            { value: 'all', label: 'All', count: base.length },
            ...(['client', 'lead', 'vendor'] as const).map(k => ({ value: k, label: `${KIND_LABEL[k]}s`, count: base.filter(c => c.kind === k).length })),
          ]} />
          <SearchBox value={q} onChange={setQ} placeholder="Search name, phone or email" label="Search contacts" className="lg:w-80" />
        </Toolbar>
        <div className="overflow-x-auto">
          <table className={T.table}>
            <thead className={T.head}>
              <tr>
                <th className={T.th}>Name</th>
                <th className={`${T.th} hidden sm:table-cell`}>Mobile</th>
                <th className={`${T.th} hidden lg:table-cell`}>Email</th>
                <th className={`${T.th} hidden md:table-cell`}>Latest lead</th>
                <th className={`${T.th} hidden text-right md:table-cell`}>Leads</th>
                <th className={T.th}>Type</th>
              </tr>
            </thead>
            <tbody className={T.body}>
              {rows.map(c => (
                <tr key={c.id} onClick={() => nav(`/contacts/${c.id}`)} className={T.row}>
                  <td className={T.td}>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={c.name} size="sm" />
                      <Link to={`/contacts/${c.id}`} onClick={e => e.stopPropagation()} className="font-semibold text-slate-900 hover:text-blue-700 hover:underline">{c.name}</Link>
                    </div>
                  </td>
                  <td className={`${T.td} hidden whitespace-nowrap text-slate-600 sm:table-cell`}>{prettyPhone(c.phone)}</td>
                  <td className={`${T.td} hidden text-slate-600 lg:table-cell`}>{c.email ?? '—'}</td>
                  <td className={`${T.td} hidden md:table-cell`}>{c.latest ? <StageChip status={c.latest.status} /> : <span className="text-slate-400">—</span>}</td>
                  <td className={`${T.td} hidden text-right text-slate-600 md:table-cell`}>{c.lead_count || '—'}</td>
                  <td className={T.td}><Badge tone={KIND_TONE[c.kind]}>{KIND_LABEL[c.kind]}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length ? <RecordCount shown={rows.length} total={data.length} noun="contacts" /> : <Empty icon={Contact2}>No contacts match.</Empty>}
      </Card>
      <ContactModal open={adding} onClose={() => setAdding(false)} />
    </>
  )
}

export function ContactModal({ open, onClose, contact }: { open: boolean; onClose: () => void; contact?: Contact }) {
  return <Modal open={open} onClose={onClose} title={contact ? 'Edit contact' : 'New contact'}><ContactForm contact={contact} onDone={onClose} /></Modal>
}

function ContactForm({ contact, onDone }: { contact?: Contact; onDone: () => void }) {
  const save = useSaveContact()
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const s = (k: string) => String(f.get(k) ?? '').trim()
    save.mutate({ id: contact?.id, input: { name: s('name'), phone: s('phone'), email: s('email') || null, kind: s('kind') as Contact['kind'] } }, { onSuccess: onDone })
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Name *"><input name="name" required defaultValue={contact?.name} className={inputCls} /></Field>
      <Field label="Mobile *"><input name="phone" required inputMode="tel" defaultValue={contact ? prettyPhone(contact.phone) : ''} className={inputCls} placeholder="+91 98765 43210" /></Field>
      <Field label="Email"><input name="email" type="email" defaultValue={contact?.email ?? ''} className={inputCls} /></Field>
      <Field label="Type" hint="Buyers become leads through the Leads page so they get assigned and followed up.">
        <select name="kind" defaultValue={contact?.kind ?? 'vendor'} className={inputCls}>
          {Object.entries(KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
      <div className="flex items-center justify-end gap-3">
        <ErrorText error={save.error} />
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={save.isPending}>Save</Button>
      </div>
    </form>
  )
}
