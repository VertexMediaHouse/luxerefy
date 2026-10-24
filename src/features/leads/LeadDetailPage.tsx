import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Activity as ActivityIcon, Building2, CalendarPlus, Check, CheckCircle2, Clock, Hash, Home, Mail, MapPin, MessageSquare, Phone, PhoneCall, Plus, Sparkles, StickyNote, Trash2, Users, Wallet, X, XCircle } from 'lucide-react'
import { Avatar, Badge, Button, buttonCls, StageChip, StageIcon, Card, CardHeader, Empty, ErrorText, Field, HeaderLink, inlineInputCls, inputCls, Loading, Modal, PageHeader } from '../../components/ui'
import { isLost, wonOf } from '../../lib/rules'
import { NEXT_ACTIONS, SOURCE_LABEL, TASK_KIND_LABEL, TIMED_KINDS } from '../../lib/labels'
import { stagesOf } from '../../lib/stages'
import { budget, dateTime, prettyPhone, relative, toLocalInput } from '../../lib/format'
import type { ActivityType, Task, TaskKind } from '../../lib/types'
import { interestOf, useDeleteLead, useLead, useLeadActions } from './api'
import { ActivityTimeline } from './ActivityTimeline'
import { DocumentsPanel } from '../documents/DocumentParts'
import { useProperties } from '../properties/api'
import { TaskModal } from '../tasks/TaskModal'

type Mode = 'call' | 'note' | 'text' | 'lost'
const TITLES: Record<Mode, string> = { call: 'Log a call', note: 'Add a note', text: 'Log a text', lost: 'Mark as lost' }
const OUTCOMES = ['Connected', 'No answer', 'Busy', 'Asked to call back']
const LOST_REASONS = ['Budget mismatch', 'Bought elsewhere', 'Not responding', 'Not a genuine enquiry', 'Plans on hold']

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
  const nav = useNavigate()
  const { data: lead, isLoading } = useLead(id)
  const actions = useLeadActions(id)
  const del = useDeleteLead()
  const [mode, setMode] = useState<Mode | null>(null)
  const [rescheduling, setRescheduling] = useState<Task | null>(null)

  if (isLoading) return <Loading />
  if (!lead) return <Card><Empty icon={Users}>This lead doesn't exist. <Link to="/leads" className="font-semibold text-slate-900 underline">Back to leads</Link></Empty></Card>
  const stages = stagesOf(lead.pipeline_id)

  return (
    <>
      <PageHeader
        back={{ to: '/leads', label: 'Leads' }}
        title={lead.contact.name}
        actions={<>
          <a href={`tel:${lead.contact.phone}`} className={buttonCls('primary')}><Phone className="size-4" /> Call</a>
          <Button variant="secondary" onClick={() => setMode('call')}><PhoneCall className="size-4" /> Log call</Button>
          <Button variant="secondary" onClick={() => setMode('text')}><MessageSquare className="size-4" /> Log text</Button>
          <Button variant="secondary" onClick={() => setMode('note')}><StickyNote className="size-4" /> Note</Button>
          <Button
            variant="secondary"
            onClick={() => {
              if (confirm(`Are you sure you want to remove lead "${lead.contact.name}"?`)) {
                del.mutate(lead.id, { onSuccess: () => nav('/leads') })
              }
            }}
            className="text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-200"
          >
            <Trash2 className="size-4" /> Remove
          </Button>
        </>}
      />

      <div className="mb-4 rounded-lg bg-slate-100 p-1.5">
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
                  className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition ${
                    active ? 'bg-white font-medium text-slate-900 shadow-sm'
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
      </div>

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
              <div className="mt-4 grid grid-cols-2 gap-2">
                <a href={`tel:${lead.contact.phone}`} className="flex flex-col items-center gap-1 rounded-lg py-2 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-slate-900"><Phone className="size-4" /> Call</a>
                {lead.contact.email
                  ? <a href={`mailto:${lead.contact.email}`} className="flex flex-col items-center gap-1 rounded-lg py-2 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-slate-900"><Mail className="size-4" /> Email</a>
                  : <span className="flex flex-col items-center gap-1 rounded-lg py-2 text-xs font-medium text-slate-300 ring-1 ring-slate-200"><Mail className="size-4" /> No email</span>}
              </div>
              <dl className="mt-4 divide-y divide-slate-100 text-sm">
                <Row icon={Phone} label="Mobile">{prettyPhone(lead.contact.phone)}</Row>
                {lead.contact.email && <Row icon={Mail} label="Email"><span className="block truncate">{lead.contact.email}</span></Row>}
                <Row icon={Home} label="Looking for">{interestOf(lead) ?? '—'}</Row>
                <Row icon={Wallet} label="Budget">{budget(lead.budget_min, lead.budget_max)}</Row>
                <Row icon={MapPin} label="City">{lead.city ?? '—'}</Row>
                {lead.source === 'referral' && <Row icon={Sparkles} label="Referred by">{lead.referral_detail ?? '—'}</Row>}
                {lead.external_ref && <Row icon={Hash} label="99acres ref">{lead.external_ref}</Row>}
                <Row icon={Clock} label="Created"><span title={dateTime(lead.created_at)}>{relative(lead.created_at)}</span></Row>
                {isLost(lead) && <Row icon={XCircle} label="Lost reason">{lead.lost_reason ?? '—'}</Row>}
              </dl>
            </div>
          </Card>
          <PropertiesPanel linked={lead.properties} onSave={ids => actions.setProperties.mutate(ids)} pending={actions.setProperties.isPending} error={actions.setProperties.error} />
          <DocumentsPanel leadId={lead.id} />
        </div>

        <div className="space-y-4">
          <FollowUpPanel lead={lead} actions={actions} onReschedule={setRescheduling} />
          <NotesPanel key={lead.id} value={lead.notes} onSave={n => actions.saveNotes.mutate(n)} pending={actions.saveNotes.isPending} saved={actions.saveNotes.isSuccess} />
          <ActivityPanel items={lead.activities} onAddNote={() => setMode('note')} />
        </div>
      </div>

      <TaskModal open={!!rescheduling} onClose={() => setRescheduling(null)} task={rescheduling} />
      <Modal open={!!mode} onClose={() => setMode(null)} title={mode ? TITLES[mode] : ''}>
        {mode && <LogForm mode={mode} lostStatus={`${lead.pipeline_id}-lost`} actions={actions} onDone={() => setMode(null)} />}
      </Modal>
    </>
  )
}

/**
 * The follow-up discipline, in the three parts you actually think in:
 * what has already happened, what is owed next, and booking the next thing.
 * Booking writes a task, which is what the calendar renders — so it shows up there immediately.
 */
function FollowUpPanel({ lead, actions, onReschedule }: { lead: NonNullable<ReturnType<typeof useLead>['data']>; actions: ReturnType<typeof useLeadActions>; onReschedule: (t: Task) => void }) {
  const [kind, setKind] = useState<TaskKind>('call')
  const timed = TIMED_KINDS.includes(kind)
  const soon = (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d })()

  const done = [
    ...lead.doneTasks.map(t => ({ id: t.id, when: t.due_at, label: t.title, tag: TASK_KIND_LABEL[t.kind] })),
    ...lead.activities.filter(a => a.type === 'call' || a.type === 'text' || a.type === 'note').map(a => ({ id: a.id, when: a.created_at, label: a.body, tag: null })),
  ].sort((a, b) => b.when.localeCompare(a.when)).slice(0, 6)

  const book = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const s = (k: string) => String(f.get(k) ?? '').trim()
    const due_at = new Date(s('due_at')).toISOString()
    actions.followUp.mutate(
      { title: s('title') || `${TASK_KIND_LABEL[kind]} ${lead.contact.name}`, kind, due_at, ends_at: timed && s('ends_at') ? new Date(s('ends_at')).toISOString() : null },
      { onSuccess: () => e.currentTarget?.reset?.() },
    )
  }

  return (
    <Card>
      <CardHeader icon={CalendarPlus} title="Follow-up" subtitle="Done, what's next, and when" />
      <div className="grid divide-y divide-slate-100 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        <section className="p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-400 uppercase"><CheckCircle2 className="size-3.5" /> Done</h3>
          {done.length ? (
            <ul className="space-y-3">
              {done.map(d => (
                <li key={d.id} className="text-sm">
                  <p className="line-clamp-2 text-slate-800">{d.label}</p>
                  <p className="text-xs text-slate-400">{d.tag ? `${d.tag}, ` : ''}{relative(d.when)}</p>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-400">Nothing logged yet.</p>}
        </section>

        <section className="p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-400 uppercase"><Clock className="size-3.5" /> Next up</h3>
          {lead.tasks.length ? (
            <ul className="space-y-3">
              {lead.tasks.map(t => {
                const overdue = Date.parse(t.due_at) < Date.now()
                return (
                  <li key={t.id} className="flex items-start gap-2.5">
                    <button type="button" onClick={() => actions.completeTask.mutate(t.id)} className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-transparent ring-1 ring-slate-300 transition hover:bg-emerald-500 hover:text-white hover:ring-emerald-500" aria-label={`Mark "${t.title}" done`}>
                      <Check className="size-3" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{t.title}</p>
                      <p className={`text-xs ${overdue ? 'font-semibold text-red-600' : 'text-slate-500'}`}>{overdue && 'Overdue, '}{dateTime(t.due_at)}</p>
                      <button type="button" onClick={() => onReschedule(t)} className="mt-0.5 text-xs font-medium text-slate-500 underline hover:text-slate-900">Reschedule</button>
                    </div>
                    <Badge tone={overdue ? 'red' : 'slate'}>{TASK_KIND_LABEL[t.kind]}</Badge>
                  </li>
                )
              })}
            </ul>
          ) : <p className="text-sm text-slate-400">Nothing booked. Set the next step so this lead doesn't go cold.</p>}
        </section>

        <form onSubmit={book} className="space-y-3 bg-slate-50/60 p-4">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-400 uppercase"><Plus className="size-3.5" /> Schedule next</h3>
          <Field label="Action">
            <select value={kind} onChange={e => setKind(e.target.value as TaskKind)} className={inputCls} aria-label="Next action">
              {NEXT_ACTIONS.map(k => <option key={k} value={k}>{TASK_KIND_LABEL[k]}</option>)}
            </select>
          </Field>
          <Field label="About"><input name="title" className={inputCls} placeholder={`${TASK_KIND_LABEL[kind]} ${lead.contact.name}`} /></Field>
          <Field label={timed ? 'Starts' : 'When'}><input name="due_at" type="datetime-local" required defaultValue={toLocalInput(soon)} className={inputCls} /></Field>
          {timed && (
            <Field label="Ends" hint="Blocks the slot in your calendar">
              <input name="ends_at" type="datetime-local" required defaultValue={toLocalInput(new Date(soon.getTime() + 3600e3))} className={inputCls} />
            </Field>
          )}
          <ErrorText error={actions.followUp.error} />
          <Button type="submit" disabled={actions.followUp.isPending} className="w-full">Add to calendar</Button>
        </form>
      </div>
    </Card>
  )
}

/** Every property this buyer has been shown. Most people look at more than one. */
function PropertiesPanel({ linked, onSave, pending, error }: { linked: { id: string; title: string; locality: string }[]; onSave: (ids: string[]) => void; pending: boolean; error: unknown }) {
  const { data: all = [] } = useProperties()
  const [adding, setAdding] = useState('')
  const ids = linked.map(p => p.id)
  const available = all.filter(p => !ids.includes(p.id))

  return (
    <Card>
      <CardHeader icon={Building2} title="Properties" subtitle={linked.length ? `${linked.length} linked` : 'None linked'} />
      {linked.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {linked.map(p => (
            <li key={p.id} className="flex items-center gap-2 px-5 py-2.5">
              <Link to={`/properties/${p.id}`} className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900 hover:underline">{p.title}</span>
                <span className="text-xs text-slate-500">{p.locality}</span>
              </Link>
              <button type="button" disabled={pending} onClick={() => onSave(ids.filter(i => i !== p.id))} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600 disabled:opacity-40" aria-label={`Unlink ${p.title}`}>
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-2 border-t border-slate-100 p-4">
        <ErrorText error={error} />
        <div className="flex gap-2">
          <select value={adding} onChange={e => setAdding(e.target.value)} className={`${inlineInputCls} min-w-0 flex-1`} aria-label="Add a property">
            <option value="">Add a property…</option>
            {available.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <Button variant="secondary" disabled={!adding || pending} onClick={() => { onSave([...ids, adding]); setAdding('') }}><Plus className="size-4" /></Button>
        </div>
      </div>
    </Card>
  )
}

/** One free-text field for this lead, saved as typed. Not the activity log. */
function NotesPanel({ value, onSave, pending, saved }: { value: string; onSave: (v: string) => void; pending: boolean; saved: boolean }) {
  const [draft, setDraft] = useState(value)
  const dirty = draft !== value
  return (
    <Card>
      <CardHeader icon={StickyNote} title="Notes" subtitle={dirty ? 'Unsaved changes' : saved ? 'Saved' : 'Anything worth remembering about this lead'} />
      <div className="space-y-3 p-5">
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={6}
          className={`${inputCls} notebook-lines`}
          aria-label="Lead notes"
          placeholder="Decision maker, budget constraints, who else is involved, what they actually want…"
        />
        <div className="flex justify-end gap-2">
          {dirty && <Button variant="secondary" onClick={() => setDraft(value)}>Discard</Button>}
          <Button onClick={() => onSave(draft)} disabled={!dirty || pending}>{dirty ? 'Save notes' : 'Saved'}</Button>
        </div>
      </div>
    </Card>
  )
}

const ACTIVITY_LABEL: Record<ActivityType, string> = {
  created: 'Created', enquiry: 'Enquiries', call: 'Calls', text: 'Texts', note: 'Notes',
  status_change: 'Stage changes', assignment: 'Assignments', follow_up: 'Follow-ups',
}

/** Filtered on purpose: the full log is noise until you're looking for something specific. */
function ActivityPanel({ items, onAddNote }: { items: Parameters<typeof ActivityTimeline>[0]['items']; onAddNote: () => void }) {
  const [type, setType] = useState<ActivityType | 'all'>('all')
  const [showAll, setShowAll] = useState(false)
  const present = [...new Set(items.map(i => i.type))]
  const filtered = type === 'all' ? items : items.filter(i => i.type === type)
  const shown = showAll ? filtered : filtered.slice(0, 6)

  return (
    <Card>
      <CardHeader
        icon={ActivityIcon}
        title="Activity"
        subtitle={`${filtered.length} ${filtered.length === 1 ? 'entry' : 'entries'}`}
        action={<div className="flex items-center gap-2">
          <select value={type} onChange={e => { setType(e.target.value as ActivityType | 'all'); setShowAll(false) }} className={`${inlineInputCls} py-1 text-xs`} aria-label="Filter activity">
            <option value="all">Everything</option>
            {present.map(t => <option key={t} value={t}>{ACTIVITY_LABEL[t]}</option>)}
          </select>
          <HeaderLink onClick={onAddNote}>Add note</HeaderLink>
        </div>}
      />
      <div className="p-5"><ActivityTimeline items={shown} /></div>
      {filtered.length > shown.length && (
        <button type="button" onClick={() => setShowAll(true)} className="w-full border-t border-slate-100 py-2.5 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-900">
          Show {filtered.length - shown.length} older {filtered.length - shown.length === 1 ? 'entry' : 'entries'}
        </button>
      )}
    </Card>
  )
}

function LogForm({ mode, actions, lostStatus, onDone }: { mode: Mode; actions: ReturnType<typeof useLeadActions>; lostStatus: string; onDone: () => void }) {
  const m = mode === 'lost' ? actions.setStatus : actions.log

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const s = (k: string) => String(f.get(k) ?? '').trim()
    const opts = { onSuccess: onDone }
    if (mode === 'call') actions.log.mutate({ type: 'call', body: `Call: ${s('outcome')}${s('body') ? ` — ${s('body')}` : ''}` }, opts)
    if (mode === 'text') actions.log.mutate({ type: 'text', body: `Text sent: ${s('body')}` }, opts)
    if (mode === 'note') actions.log.mutate({ type: 'note', body: s('body') }, opts)
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
      <Field label={mode === 'call' ? 'Details (optional)' : mode === 'lost' ? 'Anything else (optional)' : mode === 'text' ? 'What you sent' : 'Note'}>
        <textarea name="body" rows={3} required={mode === 'note' || mode === 'text'} className={inputCls} placeholder={mode === 'call' ? 'What was discussed?' : ''} />
      </Field>
      <div className="flex items-center justify-end gap-3">
        <ErrorText error={m.error} />
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" variant={mode === 'lost' ? 'danger' : 'primary'} disabled={m.isPending}>{mode === 'lost' ? 'Mark lost' : 'Save'}</Button>
      </div>
    </form>
  )
}
