import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import {
  CalendarClock,
  CalendarPlus,
  Check,
  Clock,
  Handshake,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  PhoneCall,
  Plus,
  ShieldAlert,
  StickyNote,
} from 'lucide-react'
import {
  Avatar,
  Badge,
  Button,
  buttonCls,
  Card,
  CardHeader,
  Empty,
  ErrorText,
  Field,
  inputCls,
  Modal,
  PageHeader,
  StageChip,
  StageIcon,
} from '../../components/ui'
import { useUser } from '../../lib/session'
import { db, write, ok } from '../../lib/db'
import { supabase } from '../../lib/supabase'
import { stagesOf, stageLabel } from '../../lib/stages'
import { budget, dateTime, prettyPhone, relative, waLink } from '../../lib/format'
import { isLost, wonOf } from '../../lib/rules'
import { SOURCE_LABEL, TASK_KIND_LABEL } from '../../lib/labels'
import type { Task } from '../../lib/types'
import { ActivityTimeline } from '../leads/ActivityTimeline'
import { useLeads } from '../leads/api'
import { isOverdue, useSaveTask, useSetTaskStatus, useTasks } from '../tasks/api'
import { QUICK_DUE, SalesTaskModal } from './SalesTaskModal'

type LogMode = 'call' | 'text' | 'meeting' | 'note' | 'lost'

const TITLES: Record<LogMode, string> = {
  call: 'Log a Phone Call',
  text: 'Log an SMS / WhatsApp Message',
  meeting: 'Log a Meeting with Client',
  note: 'Add Scratchpad Note',
  lost: 'Mark Lead as Lost',
}

const CALL_OUTCOMES = ['Connected - Interested', 'Connected - Follow up later', 'Busy / No Answer', 'Wrong Number']
const LOST_REASONS = ['Budget mismatch', 'Bought elsewhere', 'Not responding', 'Not a genuine enquiry', 'Plans on hold']

export function SalesLeadDetailPage() {
  const { id = '' } = useParams()
  const user = useUser()
  // Subscribe so stage changes, logs and task edits re-render this page.
  useLeads()
  useTasks()
  const saveTask = useSaveTask()
  const setTaskStatus = useSetTaskStatus()
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [followUpError, setFollowUpError] = useState('')

  const lead = db.leads.find(l => l.id === id)
  const contact = lead ? db.contacts.find(c => c.id === lead.contact_id) : null

  const [mode, setMode] = useState<LogMode | null>(null)
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [notes, setNotes] = useState(lead?.notes || '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const [statusPending, setStatusPending] = useState(false)
  const [statusError, setStatusError] = useState('')

  // SECURITY CHECK: Sales reps can only view their own assigned leads
  if (!lead || lead.assigned_to !== user.id) {
    return (
      <Card className="p-8 text-center max-w-lg mx-auto mt-10">
        <ShieldAlert className="size-12 text-red-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900">Access Denied</h2>
        <p className="mt-1 text-sm text-slate-500">
          You do not have permission to access this lead. It is not assigned to your account.
        </p>
        <div className="mt-5">
          <Link to="/sales/leads">
            <Button>Back to My Leads</Button>
          </Link>
        </div>
      </Card>
    )
  }

  const stages = stagesOf(lead.pipeline_id)
  const myTasks = db.tasks.filter(t => t.lead_id === lead.id && t.status !== 'cancelled')
  const pendingTasks = myTasks.filter(t => t.status === 'pending').sort((a, b) => a.due_at.localeCompare(b.due_at))

  const leadActivities = db.lead_activities
    .filter(a => a.lead_id === lead.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

  const bookFollowUp = (due: Date) => {
    setFollowUpError('')
    saveTask.mutate(
      {
        input: {
          title: `Follow up ${contact?.name ?? 'lead'}`,
          kind: 'call',
          lead_id: lead.id,
          property_id: null,
          assigned_to: user.id,
          due_at: due.toISOString(),
          ends_at: null,
        },
      },
      { onError: e => setFollowUpError(e.message) },
    )
  }

  // Handle stage change
  const handleStageChange = async (newStatus: string, reason?: string) => {
    setStatusPending(true)
    setStatusError('')
    try {
      await write(async () => {
        // Update first, log second: a failed update must not leave a stage change in the timeline.
        ok(
          await supabase
            .from('leads')
            .update({
              status: newStatus,
              lost_reason: newStatus.endsWith('-lost') ? reason || null : null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', lead.id),
        )

        // actor_id is stamped from the session by the database.
        ok(await supabase.from('lead_activities').insert({
          lead_id: lead.id,
          type: 'status_change',
          body: `Stage changed from ${stageLabel(lead.status)} to ${stageLabel(newStatus)}${
            reason ? ` — ${reason}` : ''
          }`,
          actor_id: user.id,
        }))

        // If marked won, update contact to client
        if (newStatus.endsWith('-won') && contact?.kind === 'lead') {
          await supabase.from('contacts').update({ kind: 'client' }).eq('id', contact.id)
        }
      })
    } catch (err: any) {
      setStatusError(err.message || 'Failed to update stage')
    } finally {
      setStatusPending(false)
    }
  }

  // Handle note saving
  const handleSaveNotes = async () => {
    setSavingNotes(true)
    try {
      await write(async () => {
        ok(
          await supabase
            .from('leads')
            .update({ notes: notes.trim(), updated_at: new Date().toISOString() })
            .eq('id', lead.id),
        )
      })
      setNotesSaved(true)
      setTimeout(() => setNotesSaved(false), 2000)
    } catch (err: any) {
      alert('Failed to save notes: ' + err.message)
    } finally {
      setSavingNotes(false)
    }
  }

  // Handle logging activity form
  const handleLogSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const outcome = String(f.get('outcome') || '').trim()
    const reason = String(f.get('reason') || '').trim()
    const bodyText = String(f.get('body') || '').trim()

    let fullBody = bodyText
    if (outcome) fullBody = `[${outcome}] ${bodyText}`

    if (mode === 'lost') {
      await handleStageChange(`${lead.pipeline_id}-lost`, reason || bodyText)
      setMode(null)
      return
    }

    try {
      await write(async () => {
        ok(
          await supabase.from('lead_activities').insert({
            lead_id: lead.id,
            type: mode === 'call' ? 'call' : mode === 'text' ? 'text' : mode === 'meeting' ? 'call' : 'note',
            body: fullBody,
            actor_id: user.id,
            meta: { outcome },
          }),
        )
      })
      setMode(null)
    } catch (err: any) {
      alert('Error saving activity: ' + err.message)
    }
  }

  return (
    <>
      <PageHeader
        back={{ to: '/sales/leads', label: 'My Leads' }}
        title={contact?.name || 'Lead Details'}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {contact?.phone && (
              <>
                <a href={`tel:${contact.phone}`} className={buttonCls('primary')}>
                  <Phone className="size-4" /> Call
                </a>
                <a href={waLink(contact.phone)} target="_blank" rel="noreferrer" className={buttonCls('secondary')}>
                  <MessageCircle className="size-4 text-emerald-600" /> WhatsApp
                </a>
              </>
            )}
            <span className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" />
            <Button variant="secondary" onClick={() => setMode('call')}>
              <PhoneCall className="size-4" /> Log call
            </Button>
            <Button variant="secondary" onClick={() => setMode('text')}>
              <MessageSquare className="size-4" /> Log text
            </Button>
            <Button variant="secondary" onClick={() => setMode('meeting')}>
              <Handshake className="size-4" /> Log meeting
            </Button>
            <Button variant="secondary" onClick={() => setTaskModalOpen(true)}>
              <CalendarPlus className="size-4" /> Follow-up
            </Button>
          </div>
        }
      />

      {/* Stage Stepper */}
      <div className="mb-6 rounded-xl bg-slate-100 p-2 border border-slate-200/80">
        <ol className="flex items-center gap-1 overflow-x-auto" aria-label="Pipeline stage">
          {stages.map((s, i) => {
            const cur = stages.findIndex(o => o.id === lead.status)
            const isCurrent = lead.status === s.id
            const isDone = !isLost(lead) && i < cur

            return (
              <li key={s.id} className="flex flex-1 items-center gap-1.5">
                <button
                  type="button"
                  disabled={statusPending}
                  onClick={() => {
                    if (s.kind === 'lost') setMode('lost')
                    else handleStageChange(s.id)
                  }}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold whitespace-nowrap transition-all ${
                    isCurrent
                      ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                      : isDone
                        ? 'text-slate-700 hover:bg-white/60'
                        : 'text-slate-400 hover:bg-white/60 hover:text-slate-700'
                  }`}
                >
                  <StageIcon status={isDone ? wonOf(lead.pipeline_id) : s.id} className="size-3.5" />
                  {s.label}
                </button>
                {i < stages.length - 1 && (
                  <span className={`h-px min-w-3 flex-1 ${isDone ? 'bg-slate-300' : 'bg-slate-200'}`} />
                )}
              </li>
            )
          })}
        </ol>
        <ErrorText error={statusError} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        {/* Left Column: Contact info & Lead details */}
        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-center gap-3.5 mb-4">
              <Avatar name={contact?.name || 'Lead'} size="lg" />
              <div>
                <h2 className="text-base font-bold text-slate-900">{contact?.name || 'Unknown'}</h2>
                <div className="mt-1 flex items-center gap-1.5">
                  <StageChip status={lead.status} />
                  <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                    {SOURCE_LABEL[lead.source]}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 border-y border-slate-100 py-3 mb-3">
              {contact?.phone ? (
                <a
                  href={`tel:${contact.phone}`}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Phone className="size-3.5 text-blue-600" /> Call
                </a>
              ) : null}
              {contact?.email ? (
                <a
                  href={`mailto:${contact.email}`}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Mail className="size-3.5 text-slate-500" /> Email
                </a>
              ) : null}
            </div>

            <dl className="divide-y divide-slate-100 text-xs">
              <div className="py-2 flex items-center justify-between">
                <dt className="text-slate-400">Mobile Phone</dt>
                <dd className="font-semibold text-slate-800">{contact ? prettyPhone(contact.phone) : '—'}</dd>
              </div>
              {contact?.email && (
                <div className="py-2 flex items-center justify-between">
                  <dt className="text-slate-400">Email Address</dt>
                  <dd className="font-semibold text-slate-800 truncate max-w-36">{contact.email}</dd>
                </div>
              )}
              <div className="py-2 flex items-center justify-between">
                <dt className="text-slate-400">Interest</dt>
                <dd className="font-semibold text-slate-800 truncate max-w-36">
                  {lead.property_interest || '—'}
                </dd>
              </div>
              <div className="py-2 flex items-center justify-between">
                <dt className="text-slate-400">Budget Range</dt>
                <dd className="font-semibold text-slate-800">{budget(lead.budget_min, lead.budget_max)}</dd>
              </div>
              <div className="py-2 flex items-center justify-between">
                <dt className="text-slate-400">Target City</dt>
                <dd className="font-semibold text-slate-800">{lead.city || '—'}</dd>
              </div>
              <div className="py-2 flex items-center justify-between">
                <dt className="text-slate-400">Assigned Since</dt>
                <dd className="text-slate-600">{relative(lead.created_at)}</dd>
              </div>
              {lead.lost_reason && (
                <div className="py-2 flex items-center justify-between">
                  <dt className="text-red-500 font-semibold">Lost Reason</dt>
                  <dd className="text-red-700 font-medium">{lead.lost_reason}</dd>
                </div>
              )}
            </dl>
          </Card>

          {/* Scratchpad Notes Card */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                <StickyNote className="size-3.5 text-blue-600" /> Sales Scratchpad
              </span>
              {notesSaved && (
                <span className="text-[11px] font-medium text-emerald-600 flex items-center gap-1">
                  <Check className="size-3" /> Saved
                </span>
              )}
            </div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={5}
              placeholder="Private notes: client timeline, requirements, family members involved, preferences…"
              className={`${inputCls} text-xs`}
            />
            <div className="mt-2 flex justify-end">
              <Button
                variant="secondary"
                onClick={handleSaveNotes}
                disabled={savingNotes || notes === (lead.notes || '')}
                className="text-xs"
              >
                {savingNotes ? 'Saving…' : 'Save Notes'}
              </Button>
            </div>
          </Card>
        </div>

        {/* Right Column: Follow-ups & Activity Timeline */}
        <div className="space-y-6">
          {/* Follow-up Tasks Section */}
          <Card>
            <CardHeader
              icon={CalendarClock}
              title="Follow-ups & Tasks"
              subtitle={`${pendingTasks.length} pending`}
              action={
                <Button variant="secondary" onClick={() => setTaskModalOpen(true)}>
                  <Plus className="size-3.5" /> Book Follow-up
                </Button>
              }
            />
            {pendingTasks.length === 0 && !isLost(lead) && (
              <div className="flex flex-wrap items-center gap-2 border-b border-amber-100 bg-amber-50/60 px-4 py-3 text-xs">
                <span className="font-medium text-amber-900">No next step booked. Call back:</span>
                {QUICK_DUE.slice(1).map(q => (
                  <button
                    key={q.label}
                    type="button"
                    disabled={saveTask.isPending}
                    onClick={() => bookFollowUp(q.date())}
                    className="rounded-full bg-white px-2.5 py-1 font-medium text-slate-700 ring-1 ring-amber-200 hover:ring-amber-400"
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            )}
            <ErrorText error={followUpError} />
            <div className="divide-y divide-slate-100">
              {pendingTasks.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">No pending follow-ups.</div>
              ) : (
                pendingTasks.map(t => {
                  const overdue = isOverdue(t)
                  return (
                    <div
                      key={t.id}
                      onClick={() => setEditingTask(t)}
                      className="flex cursor-pointer items-center gap-3 px-4 py-3 text-xs hover:bg-slate-50"
                    >
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation()
                          setTaskStatus.mutate({ id: t.id, status: 'done' })
                        }}
                        className="flex size-5 shrink-0 items-center justify-center rounded-md border border-slate-300 text-transparent hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-600"
                        title="Mark done"
                        aria-label={`Mark ${t.title} done`}
                      >
                        <Check className="size-3.5" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-slate-900">{t.title}</div>
                        <div className={overdue ? 'font-medium text-red-600' : 'text-slate-500'}>
                          {TASK_KIND_LABEL[t.kind]} · {dateTime(t.due_at)}
                        </div>
                      </div>
                      {overdue && <Badge tone="red">Overdue</Badge>}
                    </div>
                  )
                })
              )}
            </div>
          </Card>

          {/* Activity Timeline */}
          <Card>
            <CardHeader
              icon={Clock}
              title="Activity Timeline"
              subtitle="All calls, messages, notes and stage updates"
            />
            <div className="p-5">
              {leadActivities.length === 0 ? (
                <Empty icon={Clock}>No activity logged yet.</Empty>
              ) : (
                <ActivityTimeline
                  items={leadActivities.map(a => ({
                    ...a,
                    actor: a.actor_id === user.id ? user.full_name : 'Management',
                    lead: { id: lead.id, name: contact?.name || 'Lead' },
                  }))}
                />
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Log Activity Modal */}
      {mode && (
        <Modal open={!!mode} onClose={() => setMode(null)} title={TITLES[mode]}>
          <form onSubmit={handleLogSubmit} className="space-y-4">
            {mode === 'call' && (
              <Field label="Call Outcome">
                <select name="outcome" className={inputCls} required>
                  {CALL_OUTCOMES.map(o => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {mode === 'lost' && (
              <Field label="Reason for Losing Lead">
                <select name="reason" className={inputCls} required>
                  {LOST_REASONS.map(r => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field label={mode === 'lost' ? 'Additional Notes' : 'Discussion / Message Content'}>
              <textarea
                name="body"
                required
                rows={3}
                placeholder={
                  mode === 'call'
                    ? 'What did the client say? What are the next steps?'
                    : mode === 'text'
                      ? 'What was sent to the client?'
                      : 'Enter details…'
                }
                className={inputCls}
              />
            </Field>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button variant="secondary" onClick={() => setMode(null)}>
                Cancel
              </Button>
              <Button type="submit">{mode === 'lost' ? 'Confirm Lead Lost' : 'Save Log'}</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Task Creation Modal */}
      {(taskModalOpen || editingTask) && (
        <SalesTaskModal
          open
          onClose={() => {
            setTaskModalOpen(false)
            setEditingTask(null)
          }}
          task={editingTask}
          defaultLeadId={lead.id}
        />
      )}
    </>
  )
}
