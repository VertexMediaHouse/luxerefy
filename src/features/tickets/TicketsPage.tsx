import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { AlertTriangle, CircleDot, LifeBuoy, Plus, Timer } from 'lucide-react'
import { Avatar, Badge, Button, Card, Empty, ErrorText, Field, inputCls, Loading, Modal, PageHeader, RecordCount, T, Tabs, Toolbar } from '../../components/ui'
import { useProfiles, useUser } from '../../lib/session'
import { isManager, SLA_HOURS } from '../../lib/rules'
import { PRIORITY_LABEL, PRIORITY_TONE, TICKET_STATUS_LABEL, TICKET_STATUS_TONE } from '../../lib/labels'
import { dateTime, duration, relative } from '../../lib/format'
import type { TicketPriority, TicketStatus } from '../../lib/types'
import { useLeads } from '../leads/api'
import { useProperties } from '../properties/api'
import { useCreateTicket, useTickets, useUpdateTicket, type TicketRow } from './api'

export const ticketNo = (n: number) => `#TK-${String(n).padStart(3, '0')}`

export function Sla({ t }: { t: TicketRow }) {
  if (t.status === 'resolved' && t.resolved_at) return <span className="text-xs text-slate-500">Resolved in {duration(Date.parse(t.resolved_at) - Date.parse(t.created_at))}</span>
  const left = Date.parse(t.sla_due_at) - Date.now()
  const tone = left < 0 ? 'text-red-600' : left < SLA_HOURS[t.priority] * 3600e3 * 0.25 ? 'text-amber-600' : 'text-slate-600'
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${tone}`}>
      <Timer className="size-3.5" /> {left < 0 ? `SLA breached ${duration(left)} ago` : `${duration(left)} left`}
      {t.escalation_level > 0 && <Badge tone="red"><AlertTriangle className="size-3" /> Escalated L{t.escalation_level}</Badge>}
    </span>
  )
}

export function TicketsPage() {
  const user = useUser()
  const { data } = useTickets()
  const [tab, setTab] = useState<TicketStatus | 'all'>('all')
  const [raising, setRaising] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  if (!data) return <Loading />

  const rows = tab === 'all' ? data : data.filter(t => t.status === tab)
  const open = data.find(t => t.id === openId)

  return (
    <>
      <PageHeader icon={LifeBuoy} tint="text-rose-500"
        title="Tickets"
        subtitle={isManager(user) ? 'Issues across the team, with SLA and auto-escalation' : 'Tickets you raised or are assigned to'}
        actions={<Button onClick={() => setRaising(true)}><Plus className="size-4" /> Raise ticket</Button>}
      />
      <Card>
        <Toolbar>
          <Tabs value={tab} onChange={setTab} items={[
            { value: 'all', label: 'All', count: data.length },
            ...(['pending', 'in_progress', 'resolved'] as const).map(s => ({ value: s, label: TICKET_STATUS_LABEL[s], count: data.filter(t => t.status === s).length })),
          ]} />
        </Toolbar>
        <div className="overflow-x-auto">
          <table className={T.table}>
            <thead className={T.head}>
              <tr>
                <th className={`${T.th} hidden sm:table-cell`}>Number</th>
                <th className={T.th}>Subject</th>
                <th className={`${T.th} hidden lg:table-cell`}>SLA</th>
                <th className={`${T.th} hidden md:table-cell`}>Priority</th>
                <th className={T.th}>Status</th>
                <th className={`${T.th} hidden md:table-cell`}>Assignee</th>
              </tr>
            </thead>
            <tbody className={T.body}>
              {rows.map(t => (
                <tr key={t.id} onClick={() => setOpenId(t.id)} className={T.row}>
                  <td className={`${T.td} hidden font-medium whitespace-nowrap text-slate-500 sm:table-cell`}>{ticketNo(t.number)}</td>
                  <td className={T.td}>
                    <button type="button" onClick={e => { e.stopPropagation(); setOpenId(t.id) }} className="block max-w-[26rem] truncate text-left font-semibold text-slate-900 hover:text-blue-700 hover:underline">{t.title}</button>
                    <span className="block max-w-[26rem] truncate text-xs text-slate-500">{[t.lead_name, t.property_title].filter(Boolean).join(', ') || 'General'}, raised {relative(t.created_at)}</span>
                  </td>
                  <td className={`${T.td} hidden lg:table-cell`}><Sla t={t} /></td>
                  <td className={`${T.td} hidden md:table-cell`}><Badge tone={PRIORITY_TONE[t.priority]}>{PRIORITY_LABEL[t.priority]}</Badge></td>
                  <td className={T.td}><Badge tone={TICKET_STATUS_TONE[t.status]}>{TICKET_STATUS_LABEL[t.status]}</Badge></td>
                  <td className={`${T.td} hidden md:table-cell`}>
                    {t.assignee_name ? <span className="flex items-center gap-2 whitespace-nowrap text-slate-700"><Avatar name={t.assignee_name} size="sm" />{t.assignee_name}</span> : <span className="text-slate-400">Unassigned</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length ? <RecordCount shown={rows.length} total={data.length} noun="tickets" /> : <Empty icon={LifeBuoy}>No tickets here.</Empty>}
      </Card>

      <Modal open={raising} onClose={() => setRaising(false)} title="Raise a ticket" wide><RaiseForm onDone={() => setRaising(false)} /></Modal>
      <Modal open={!!open} onClose={() => setOpenId(null)} title={open ? `${ticketNo(open.number)}: ${open.title}` : ''} wide>{open && <TicketDetail t={open} />}</Modal>
    </>
  )
}

function TicketDetail({ t }: { t: TicketRow }) {
  const user = useUser()
  const { data: profiles } = useProfiles()
  const update = useUpdateTicket()
  const steps = [
    { at: t.created_at, label: `Raised by ${t.raised_by_name}` },
    t.in_progress_at && { at: t.in_progress_at, label: 'Work started' },
    t.escalated_at && { at: t.escalated_at, label: `Escalated to level ${t.escalation_level} (SLA breached)` },
    t.resolved_at && { at: t.resolved_at, label: 'Resolved' },
  ].filter(s => !!s).sort((a, b) => a.at.localeCompare(b.at))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={TICKET_STATUS_TONE[t.status]}>{TICKET_STATUS_LABEL[t.status]}</Badge>
        <Badge tone={PRIORITY_TONE[t.priority]}>{PRIORITY_LABEL[t.priority]}, {SLA_HOURS[t.priority]}h SLA</Badge>
        <Sla t={t} />
      </div>
      {t.description && <p className="text-sm leading-relaxed whitespace-pre-line text-slate-700">{t.description}</p>}
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {t.lead_id && <div><dt className="text-xs text-slate-500">Lead</dt><dd><Link to={`/leads/${t.lead_id}`} className="font-semibold text-blue-700 hover:underline">{t.lead_name}</Link></dd></div>}
        {t.property_id && <div><dt className="text-xs text-slate-500">Property</dt><dd><Link to={`/properties/${t.property_id}`} className="font-semibold text-blue-700 hover:underline">{t.property_title}</Link></dd></div>}
        <div>
          <dt className="text-xs text-slate-500">Assigned to</dt>
          <dd>
            {isManager(user) ? (
              <select value={t.assigned_to ?? ''} onChange={e => update.mutate({ id: t.id, assigned_to: e.target.value || null })} className={`${inputCls} mt-1 py-1.5`} aria-label="Assign ticket">
                <option value="">Unassigned</option>
                {profiles.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            ) : <span className="font-semibold">{t.assignee_name ?? 'Unassigned'}</span>}
          </dd>
        </div>
        <div><dt className="text-xs text-slate-500">SLA due</dt><dd className="font-semibold">{dateTime(t.sla_due_at)}</dd></div>
      </dl>
      <ol className="space-y-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-900/[0.05]">
        {steps.map(s => (
          <li key={s.label} className="flex items-start gap-2.5 text-sm">
            <CircleDot className="mt-0.5 size-4 shrink-0 text-blue-600" />
            <span><span className="font-semibold text-slate-800">{s.label}</span><span className="block text-xs text-slate-500">{dateTime(s.at)}</span></span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ErrorText error={update.error} />
        {t.status === 'pending' && <Button variant="secondary" onClick={() => update.mutate({ id: t.id, status: 'in_progress' })}>Start work</Button>}
        {t.status !== 'resolved' && <Button onClick={() => update.mutate({ id: t.id, status: 'resolved' })}>Mark resolved</Button>}
        {t.status === 'resolved' && <Button variant="secondary" onClick={() => update.mutate({ id: t.id, status: 'pending' })}>Reopen</Button>}
      </div>
    </div>
  )
}

function RaiseForm({ onDone }: { onDone: () => void }) {
  const user = useUser()
  const { data: leads = [] } = useLeads()
  const { data: properties = [] } = useProperties()
  const { data: profiles } = useProfiles()
  const create = useCreateTicket()

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const s = (k: string) => String(f.get(k) ?? '').trim()
    create.mutate(
      { title: s('title'), description: s('description'), priority: s('priority') as TicketPriority, lead_id: s('lead_id') || null, property_id: s('property_id') || null, assigned_to: s('assigned_to') || null },
      { onSuccess: onDone },
    )
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Title *" className="sm:col-span-2"><input name="title" required className={inputCls} placeholder="What's wrong?" /></Field>
      <Field label="Details" className="sm:col-span-2"><textarea name="description" rows={3} className={inputCls} /></Field>
      <Field label="Priority">
        <select name="priority" defaultValue="normal" className={inputCls}>
          {(Object.keys(SLA_HOURS) as TicketPriority[]).map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]} — {SLA_HOURS[p]}h SLA</option>)}
        </select>
      </Field>
      {isManager(user) ? (
        <Field label="Assign to">
          <select name="assigned_to" defaultValue="" className={inputCls}>
            <option value="">Unassigned</option>
            {profiles.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </Field>
      ) : <p className="self-end pb-2 text-xs text-slate-500">A manager will pick this up.</p>}
      <Field label="Related lead">
        <select name="lead_id" defaultValue="" className={inputCls}>
          <option value="">None</option>
          {leads.map(l => <option key={l.id} value={l.id}>{l.contact.name}</option>)}
        </select>
      </Field>
      <Field label="Related property">
        <select name="property_id" defaultValue="" className={inputCls}>
          <option value="">None</option>
          {properties.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </Field>
      <div className="flex items-center justify-end gap-3 sm:col-span-2">
        <ErrorText error={create.error} />
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={create.isPending}>Raise ticket</Button>
      </div>
    </form>
  )
}
