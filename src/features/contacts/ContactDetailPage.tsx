import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { Contact2, Mail, Pencil, Phone } from 'lucide-react'
import { Avatar, Badge, Button, buttonCls, Card, CardHeader, Empty, Loading, PageHeader, StageChip } from '../../components/ui'
import { SOURCE_LABEL } from '../../lib/labels'
import { budget, prettyPhone, relative } from '../../lib/format'
import { ActivityTimeline } from '../leads/ActivityTimeline'
import { useDocuments } from '../documents/api'
import { DocList } from '../documents/DocumentParts'
import { useContact } from './api'
import { ContactModal, KIND_LABEL, KIND_TONE } from './ContactsPage'

export function ContactDetailPage() {
  const { id = '' } = useParams()
  const { data: c, isLoading } = useContact(id)
  const { data: docs = [] } = useDocuments()
  const [editing, setEditing] = useState(false)
  if (isLoading) return <Loading />
  if (!c) return <Card><Empty icon={Contact2}>Contact not found. <Link to="/contacts" className="font-semibold text-blue-700">Back</Link></Empty></Card>
  const leadIds = new Set(c.leads.map(l => l.id))

  return (
    <>
      <PageHeader
        back={{ to: '/contacts', label: 'Contacts' }}
        title={c.name}
        actions={<>
          <a href={`tel:${c.phone}`} className={buttonCls('secondary')}><Phone className="size-4" /> Call</a>
          <Button variant="secondary" onClick={() => setEditing(true)}><Pencil className="size-4" /> Edit</Button>
        </>}
      />
      <Card className="flex flex-wrap items-center gap-4 p-5 sm:p-6">
        <Avatar name={c.name} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-900">{c.name}</h2>
            <Badge tone={KIND_TONE[c.kind]}>{KIND_LABEL[c.kind]}</Badge>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
            <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1.5 hover:text-blue-700"><Phone className="size-3.5" /> {prettyPhone(c.phone)}</a>
            {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 hover:text-blue-700"><Mail className="size-3.5" /> {c.email}</a>}
            <span className="text-slate-400">Added {relative(c.created_at)}</span>
          </div>
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card>
            <CardHeader title={`Leads (${c.leads.length})`} />
            {c.leads.length ? (
              <ul className="divide-y divide-slate-100">
                {c.leads.map(l => (
                  <li key={l.id}>
                    <Link to={`/leads/${l.id}`} className="block px-5 py-3 hover:bg-slate-50">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-slate-800">{l.property?.title ?? l.property_interest ?? 'General enquiry'}</span>
                        <StageChip status={l.status} />
                      </span>
                      <span className="text-xs text-slate-500">{SOURCE_LABEL[l.source]}, {budget(l.budget_min, l.budget_max)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="px-5 py-6 text-center text-sm text-slate-500">{c.kind === 'vendor' ? 'Vendors have no leads.' : 'No leads you can see.'}</p>}
          </Card>
          <Card>
            <CardHeader title="Documents" />
            <DocList docs={docs.filter(d => d.lead_id && leadIds.has(d.lead_id))} />
          </Card>
        </div>
        <Card className="lg:col-span-2">
          <CardHeader title="Activity log" />
          <div className="p-5"><ActivityTimeline items={c.feed} /></div>
        </Card>
      </div>
      <ContactModal open={editing} onClose={() => setEditing(false)} contact={c} />
    </>
  )
}
