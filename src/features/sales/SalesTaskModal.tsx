import { useState, useEffect } from 'react'
import { Button, ErrorText, Field, inputCls, Modal, Segmented } from '../../components/ui'
import { useUser } from '../../lib/session'
import { db, write, ok } from '../../lib/db'
import { supabase } from '../../lib/supabase'
import { TASK_KIND_LABEL, TIMED_KINDS } from '../../lib/labels'
import { toLocalInput } from '../../lib/format'
import { isOpen } from '../../lib/rules'
import { useSaveTask } from '../tasks/api'
import type { Task, TaskKind, TaskPriority } from '../../lib/types'

const at = (daysAhead: number, hour: number) => {
  const d = new Date()
  d.setDate(d.getDate() + daysAhead)
  d.setHours(hour, 0, 0, 0)
  return d
}
const nextMonday = () => at(((8 - new Date().getDay()) % 7) || 7, 11)
export const QUICK_DUE: { label: string; date: () => Date }[] = [
  { label: 'In 1 hour', date: () => new Date(Math.ceil((Date.now() + 3600e3) / 900e3) * 900e3) },
  { label: 'Tomorrow 11 AM', date: () => at(1, 11) },
  { label: 'In 3 days', date: () => at(3, 11) },
  { label: 'Next Monday', date: nextMonday },
]

export function SalesTaskModal({
  open,
  onClose,
  task = null,
  defaultLeadId = null,
  defaultDue = null,
}: {
  open: boolean
  onClose: () => void
  task?: Task | null
  defaultLeadId?: string | null
  defaultDue?: Date | null
}) {
  const user = useUser()
  const save = useSaveTask()
  const isEditing = !!task

  // Open leads first; a closed lead stays pickable only if it is already linked.
  const myLeads = db.leads.filter(l => l.assigned_to === user.id && (isOpen(l) || l.id === (task?.lead_id ?? defaultLeadId)))

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [kind, setKind] = useState<TaskKind>('call')
  const [priority, setPriority] = useState<TaskPriority>('normal')
  const [leadId, setLeadId] = useState<string>(defaultLeadId || '')
  const [dueAt, setDueAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [status, setStatus] = useState<Task['status']>('pending')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setTitle(task?.title ?? '')
    setDescription(task?.description ?? '')
    setKind(task?.kind ?? 'call')
    setPriority(task?.priority ?? 'normal')
    setLeadId(task?.lead_id ?? defaultLeadId ?? '')
    setDueAt(toLocalInput(task ? new Date(task.due_at) : defaultDue || new Date(Date.now() + 3600e3)))
    setEndsAt(task?.ends_at ? toLocalInput(new Date(task.ends_at)) : '')
    setStatus(task?.status ?? 'pending')
    setError('')
  }, [task, defaultLeadId, defaultDue, open])

  const timed = TIMED_KINDS.includes(kind)
  const leadName = (id: string) => {
    const l = db.leads.find(x => x.id === id)
    return db.contacts.find(c => c.id === l?.contact_id)?.name ?? 'Lead'
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!dueAt) return setError('Pick a due date and time')
    const due = new Date(dueAt)
    // A timed slot without an end still blocks an hour, so the double-booking guard has something to check.
    const ends = timed ? (endsAt ? new Date(endsAt) : new Date(due.getTime() + 3600e3)) : null
    setBusy(true)
    setError('')
    try {
      await save.mutateAsync({
        id: task?.id,
        input: {
          // Default title from kind + lead, so a quick "call Diya tomorrow" needs no typing.
          title: title.trim() || `${TASK_KIND_LABEL[kind]}${leadId ? ` ${leadName(leadId)}` : ''}`,
          kind,
          lead_id: leadId || null,
          property_id: task?.property_id ?? null,
          assigned_to: task?.assigned_to ?? user.id,
          due_at: due.toISOString(),
          ends_at: ends?.toISOString() ?? null,
          description: description.trim(),
          priority,
          status,
        },
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save task')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!task || !confirm('Delete this task?')) return
    setBusy(true)
    try {
      await write(async () => ok(await supabase.from('tasks').delete().eq('id', task.id)))
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete task')
    } finally {
      setBusy(false)
    }
  }

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors ${
      active ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300'
    }`

  return (
    <Modal open={open} onClose={onClose} title={isEditing ? 'Edit task' : 'New task'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <span className="mb-1.5 block text-xs font-medium text-slate-700">Type</span>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Task type">
            {(Object.keys(TASK_KIND_LABEL) as TaskKind[]).map(k => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={chip(kind === k)}>
                {TASK_KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>

        <Field label="Lead">
          <select value={leadId} onChange={e => setLeadId(e.target.value)} className={inputCls}>
            <option value="">No linked lead</option>
            {myLeads.map(l => (
              <option key={l.id} value={l.id}>
                {leadName(l.id)}
                {l.property_interest ? ` · ${l.property_interest}` : ''}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Title">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={`${TASK_KIND_LABEL[kind]}${leadId ? ` ${leadName(leadId)}` : ''}`}
            className={inputCls}
          />
        </Field>

        <div>
          <div className={`grid gap-3 ${timed ? 'sm:grid-cols-2' : ''}`}>
            <Field label={timed ? 'Starts' : 'Due'}>
              <input type="datetime-local" required value={dueAt} onChange={e => setDueAt(e.target.value)} className={inputCls} />
            </Field>
            {timed && (
              <Field label="Ends">
                <input type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)} className={inputCls} />
              </Field>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {QUICK_DUE.map(q => (
              <button
                key={q.label}
                type="button"
                onClick={() => setDueAt(toLocalInput(q.date()))}
                className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-200"
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div>
            <span className="mb-1.5 block text-xs font-medium text-slate-700">Priority</span>
            <Segmented
              label="Priority"
              value={priority}
              onChange={setPriority}
              items={[
                { value: 'low', label: 'Low' },
                { value: 'normal', label: 'Normal' },
                { value: 'high', label: 'High' },
                { value: 'urgent', label: 'Urgent' },
              ]}
            />
          </div>
          {isEditing && (
            <div>
              <span className="mb-1.5 block text-xs font-medium text-slate-700">Status</span>
              <Segmented
                label="Status"
                value={status}
                onChange={setStatus}
                items={[
                  { value: 'pending', label: 'Pending' },
                  { value: 'done', label: 'Done' },
                  { value: 'cancelled', label: 'Cancelled' },
                ]}
              />
            </div>
          )}
        </div>

        <Field label="Notes (optional)">
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            placeholder="What to cover, what to bring…"
            className={inputCls}
          />
        </Field>

        <ErrorText error={error} />

        <div className="-mx-5 -mb-5 flex items-center justify-between rounded-b-xl border-t border-slate-100 bg-slate-50/60 px-5 py-3">
          {isEditing ? (
            <button type="button" onClick={handleDelete} disabled={busy} className="text-xs font-semibold text-red-600 hover:underline">
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : isEditing ? 'Save' : 'Create task'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
