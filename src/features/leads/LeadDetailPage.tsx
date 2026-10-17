import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { Activity as ActivityIcon, Building2, CalendarPlus, Check, Clock, Hash, Home, Mail, MapPin, MessageCircle, Phone, PhoneCall, StickyNote, UserCheck, Users, Wallet, XCircle } from 'lucide-react'
import { Avatar, Badge, Button, buttonCls, StageChip, StageIcon, Card, CardHeader, Empty, ErrorText, Field, HeaderLink, inlineInputCls, inputCls, Loading, Modal, PageHeader } from '../../components/ui'
import { useProfiles, useUser } from '../../lib/session'
import { isLost, isManager, lostOf, wonOf } from '../../lib/rules'
import { SOURCE_LABEL } from '../../lib/labels'
import { stagesOf } from '../../lib/stages'
import { budget, dateTime, prettyPhone, relative, toLocalInput } from '../../lib/format'
import { useLead, useLeadActions } from './api'
import { ActivityTimeline } from './ActivityTimeline'
import { DocumentsPanel } from '../documents/DocumentParts'
import { SendTemplateModal } from '../whatsapp/WhatsAppParts'

type Mode = 'call' | 'note' | 'followup' | 'lost' | 'whatsapp'
function Row({ icon: I, label, children }: { icon: typeof Phone; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <I className="mt-0.5 size-4 shrink-0 text-slate-400" />
      <dt className="w-24 shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 flex-1 font-medium text-slate-800">{children}</dd>
    </div>
  )
}

export function LeadDetailPage() {
  const { id = '' } = useParams()
  const user = useUser()
  const { data: lead, isLoading } = useLead(id)
  const { data: profiles } = useProfiles()
  const actions = useLeadActions(id)
  const [mode, setMode] = useState<Mode | null>(null)

  if (isLoading) return <Loading />
  if (!lead) return <Card><Empty icon={Users}>This lead doesn't exist or is assigned to someone else. <Link to="/leads" className="font-semibold text-blue-700">Back to leads</Link></Empty></Card>
  const stages = stagesOf(lead.pipeline_id)

  return (
    <>
      <PageHeader
        back={{ to: '/leads', label: 'Leads' }}
        title={lead.contact.name}
        actions={<>
          <a href={`tel:${lead.contact.phone}`} className={buttonCls('primary')}><Phone className="size-4" /> Call</a>
          <Button variant="secondary" onClick={() => setMode('whatsapp')}><MessageCircle className="size-4 text-green-600" /> WhatsApp</Button>
          <Button variant="secondary" onClick={() => setMode('call')}><PhoneCall className="size-4" /> Log call</Button>
          <Button variant="secondary" onClick={() => setMode('note')}><StickyNote className="size-4" /> Note</Button>
          <Button variant="secondary" onClick={() => setMode('followup')}><CalendarPlus className="size-4" /> Follow-up</Button>
        </>}
      />

      <Card className="mb-4 bg-slate-50 p-1.5">
        <ol className="flex items-center gap-1 overflow-x-auto" aria-label="Stage">
          {stages.map((s, i) => {
            const cur = stages.findIndex(o => o.id === lead.status)
            const done = !isLost(lead) && i < cur
            const active = lead.status === s.id
            return (
              <li key={s.id} className="flex flex-1 items-center gap-2">
                <button
                  type="button"
                  disabled={actions.setStatus.isPending}
                  aria-pressed={active}
                  onClick={() => (s.kind === 'lost' ? setMode('lost') : actions.setStatus.mutate({ status: s.id }))}
                  className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition ${
                    active ? 'bg-white font-medium text-slate-900 shadow-card ring-1 ring-slate-200'
                    : done ? 'text-slate-700 hover:bg-white/70' : 'text-slate-400 hover:bg-white/70 hover:text-slate-700'}`}
                >
                  <StageIcon status={done ? wonOf(lead.pipeline_id) : s.id} className={`size-4 ${active || done ? '' : 'opacity-50'}`} />
                  {s.label}
                </button>
                {i < stages.length - 1 && <span className={`h-px min-w-3 flex-1 ${done ? 'bg-slate-300' : 'bg-slate-200'}`} />}
              </li>
            )
          })}
        </ol>
        <div className="mt-2"><ErrorText error={actions.setStatus.error} /></div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="p-5">
              <Avatar name={lead.contact.name} size="lg" />
              <h2 className="mt-3 text-lg font-semibold text-slate-900">{lead.contact.name}</h2>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <StageChip status={lead.status} />
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{SOURCE_LABEL[lead.source]}</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <a href={`tel:${lead.contact.phone}`} className="flex flex-col items-center gap-1 rounded-lg py-2 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-slate-900"><Phone className="size-4" /> Call</a>
                <button type="button" onClick={() => setMode('whatsapp')} className="flex flex-col items-center gap-1 rounded-lg py-2 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-slate-900"><MessageCircle className="size-4" /> WhatsApp</button>
                {lead.contact.email
                  ? <a href={`mailto:${lead.contact.email}`} className="flex flex-col items-center gap-1 rounded-lg py-2 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-slate-900"><Mail className="size-4" /> Email</a>
                  : <span className="flex flex-col items-center gap-1 rounded-lg py-2 text-xs font-medium text-slate-300 ring-1 ring-slate-200"><Mail className="size-4" /> No email</span>}
              </div>
              <dl className="mt-4 divide-y divide-slate-100 text-sm">
                <Row icon={Phone} label="Mobile">{prettyPhone(lead.contact.phone)}</Row>
                {lead.contact.email && <Row icon={Mail} label="Email"><span className="block truncate">{lead.contact.email}</span></Row>}
                <Row icon={Building2} label="Property">{lead.property ? <Link to={`/properties/${lead.property.id}`} className="text-blue-700 hover:underline">{lead.property.title}</Link> : '—'}</Row>
                <Row icon={Home} label="Looking for">{lead.property_interest ?? '—'}</Row>
                <Row icon={Wallet} label="Budget">{budget(lead.budget_min, lead.budget_max)}</Row>
                <Row icon={MapPin} label="City">{lead.city ?? '—'}</Row>
                {lead.external_ref && <Row icon={Hash} label="99acres ref">{lead.external_ref}</Row>}
                <Row icon={Clock} label="Created"><span title={dateTime(lead.created_at)}>{relative(lead.created_at)}</span></Row>
                <Row icon={UserCheck} label="Owner">
                  {isManager(user) ? (
                    <select value={lead.assigned_to ?? ''} onChange={e => actions.assign.mutate(e.target.value)} className={`${inlineInputCls} -my-1.5 w-full py-1.5`} aria-label="Assign lead">
                      {!lead.assigned_to && <option value="">Unassigned</option>}
                      {profiles.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                    </select>
                  ) : lead.agent?.full_name ?? 'Unassigned'}
                </Row>
                {isLost(lead) && <Row icon={XCircle} label="Lost reason">{lead.lost_reason ?? '—'}</Row>}
              </dl>
            </div>
          </Card>
          <DocumentsPanel leadId={lead.id} />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader icon={CalendarPlus} title="Follow-ups" subtitle={lead.tasks.length ? `${lead.tasks.length} scheduled` : 'Nothing scheduled'} action={<HeaderLink onClick={() => setMode('followup')}>Schedule</HeaderLink>} />
            {lead.tasks.length ? (
              <ul className="divide-y divide-slate-100">
                {lead.tasks.map(t => {
                  const overdue = Date.parse(t.due_at) < Date.now()
                  return (
                    <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                      <button type="button" onClick={() => actions.completeTask.mutate(t.id)} className="flex size-5 shrink-0 items-center justify-center rounded-full text-transparent ring-1 ring-slate-300 transition hover:bg-emerald-500 hover:text-white hover:ring-emerald-500" aria-label={`Mark "${t.title}" done`}>
                        <Check className="size-3" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{t.title}</p>
                        <p className="text-xs text-slate-500">{dateTime(t.due_at)}</p>
                      </div>
                      {overdue && <Badge tone="red">Overdue</Badge>}
                    </li>
                  )
                })}
              </ul>
            ) : <p className="px-5 py-6 text-center text-sm text-slate-500">No follow-up yet. Schedule one so this lead doesn't go cold.</p>}
          </Card>

          <Card>
            <CardHeader icon={ActivityIcon} title="Activity" subtitle="Every call, message and stage change" action={<HeaderLink onClick={() => setMode('note')}>Add note</HeaderLink>} />
            <div className="p-5"><ActivityTimeline items={lead.activities} /></div>
          </Card>
        </div>
      </div>

      <SendTemplateModal
        open={mode === 'whatsapp'}
        onClose={() => setMode(null)}
        to={{ leadId: lead.id, name: lead.contact.name, phone: lead.contact.phone, about: lead.property?.title ?? lead.property_interest ?? 'your requirement' }}
      />
      <Modal open={!!mode && mode !== 'whatsapp'} onClose={() => setMode(null)} title={mode && mode !== 'whatsapp' ? TITLES[mode] : ''}>
        {mode && mode !== 'whatsapp' && <ActionForm mode={mode} lostStatus={lostOf(lead.pipeline_id)} name={lead.contact.name} actions={actions} onDone={() => setMode(null)} />}
      </Modal>
    </>
  )
}

const TITLES: Record<Exclude<Mode, 'whatsapp'>, string> = { call: 'Log a call', note: 'Add a note', followup: 'Schedule a follow-up', lost: 'Mark as lost' }
const OUTCOMES = ['Connected', 'No answer', 'Busy', 'Asked to call back']
const LOST_REASONS = ['Budget mismatch', 'Bought elsewhere', 'Not responding', 'Not a genuine enquiry', 'Plans on hold']

function ActionForm({ mode, name, actions, lostStatus, onDone }: { mode: Exclude<Mode, 'whatsapp'>; name: string; actions: ReturnType<typeof useLeadActions>; lostStatus: string; onDone: () => void }) {
  const tomorrow10 = new Date()
  tomorrow10.setDate(tomorrow10.getDate() + 1)
  tomorrow10.setHours(10, 0, 0, 0)
  const m = { call: actions.log, note: actions.log, followup: actions.followUp, lost: actions.setStatus }[mode]

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const s = (k: string) => String(f.get(k) ?? '').trim()
    const opts = { onSuccess: onDone }
    if (mode === 'call') actions.log.mutate({ type: 'call', body: `Call: ${s('outcome')}${s('body') ? ` — ${s('body')}` : ''}` }, opts)
    if (mode === 'note') actions.log.mutate({ type: 'note', body: s('body') }, opts)
    if (mode === 'followup') actions.followUp.mutate({ title: s('title'), due_at: new Date(s('due_at')).toISOString() }, opts)
    if (mode === 'lost') actions.setStatus.mutate({ status: lostStatus, reason: [s('reason'), s('body')].filter(Boolean).join(': ') }, opts)
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {mode === 'call' && (
        <Field label="Outcome">
          <select name="outcome" className={inputCls}>{OUTCOMES.map(o => <option key={o}>{o}</option>)}</select>
        </Field>
      )}
      {mode === 'lost' && (
        <Field label="Reason">
          <select name="reason" className={inputCls}>{LOST_REASONS.map(o => <option key={o}>{o}</option>)}</select>
        </Field>
      )}
      {mode === 'followup' ? (
        <>
          <Field label="What"><input name="title" required defaultValue={`Call ${name}`} className={inputCls} /></Field>
          <Field label="When"><input name="due_at" type="datetime-local" required defaultValue={toLocalInput(tomorrow10)} className={inputCls} /></Field>
        </>
      ) : (
        <Field label={mode === 'note' ? 'Note' : 'Details (optional)'}>
          <textarea name="body" rows={3} required={mode === 'note'} className={inputCls} placeholder={mode === 'call' ? 'What was discussed?' : ''} />
        </Field>
      )}
      <div className="flex items-center justify-end gap-3">
        <ErrorText error={m.error} />
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" variant={mode === 'lost' ? 'danger' : 'primary'} disabled={m.isPending}>{mode === 'lost' ? 'Mark lost' : 'Save'}</Button>
      </div>
    </form>
  )
}
