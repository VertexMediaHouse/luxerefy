import { useState, useEffect } from 'react'
import { Button, ErrorText, Field, inputCls, Modal } from '../../components/ui'
import { useUser } from '../../lib/session'
import { db, write, ok } from '../../lib/db'
import { supabase } from '../../lib/supabase'
import { TASK_KIND_LABEL, TIMED_KINDS } from '../../lib/labels'
import { toLocalInput } from '../../lib/format'
import type { Task, TaskKind, TaskPriority } from '../../lib/types'

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
  const isEditing = !!task

  // My assigned leads
  const myLeads = db.leads.filter(l => l.assigned_to === user.id)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [kind, setKind] = useState<TaskKind>('call')
  const [priority, setPriority] = useState<TaskPriority>('normal')
  const [leadId, setLeadId] = useState<string>(defaultLeadId || '')
  const [dueAt, setDueAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [status, setStatus] = useState<'pending' | 'done' | 'cancelled'>('pending')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setDescription(task.description || '')
      setKind(task.kind)
      setPriority(task.priority || 'normal')
      setLeadId(task.lead_id || '')
      setDueAt(toLocalInput(new Date(task.due_at)))
      setEndsAt(task.ends_at ? toLocalInput(new Date(task.ends_at)) : '')
      setStatus(task.status)
    } else {
      setTitle('')
      setDescription('')
      setKind('call')
      setPriority('normal')
      setLeadId(defaultLeadId || '')
      const initialDate = defaultDue || new Date(Date.now() + 3600 * 1000)
      setDueAt(toLocalInput(initialDate))
      setEndsAt('')
      setStatus('pending')
    }
    setError('')
  }, [task, defaultLeadId, defaultDue, open])

  const timed = TIMED_KINDS.includes(kind)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError('Title is required')
      return
    }
    if (!dueAt) {
      setError('Due date and time is required')
      return
    }

    setBusy(true)
    setError('')

    try {
      const dueIso = new Date(dueAt).toISOString()
      const endsIso = timed && endsAt ? new Date(endsAt).toISOString() : null

      await write(async () => {
        if (isEditing && task) {
          ok(
            await supabase
              .from('tasks')
              .update({
                title: title.trim(),
                kind,
                lead_id: leadId || null,
                due_at: dueIso,
                ends_at: endsIso,
                status,
              })
              .eq('id', task.id),
          )
        } else {
          ok(
            await supabase.from('tasks').insert({
              id: crypto.randomUUID(),
              title: title.trim(),
              kind,
              lead_id: leadId || null,
              property_id: null,
              assigned_to: user.id,
              due_at: dueIso,
              ends_at: endsIso,
              status,
              created_by: user.id,
            }),
          )
        }
      })
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to save task')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!task) return
    if (confirm('Are you sure you want to delete this task?')) {
      setBusy(true)
      try {
        await write(async () => {
          ok(await supabase.from('tasks').delete().eq('id', task.id))
        })
        onClose()
      } catch (err: any) {
        setError(err.message || 'Failed to delete task')
      } finally {
        setBusy(false)
      }
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEditing ? 'Edit Task' : 'Create New Task'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Task Title *">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
            placeholder="e.g. Call client regarding site visit confirmation"
            className={inputCls}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Task Type">
            <select
              value={kind}
              onChange={e => setKind(e.target.value as TaskKind)}
              className={inputCls}
            >
              {Object.entries(TASK_KIND_LABEL).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Priority">
            <select
              value={priority}
              onChange={e => setPriority(e.target.value as TaskPriority)}
              className={inputCls}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </Field>
        </div>

        <Field label="Link to Assigned Lead">
          <select
            value={leadId}
            onChange={e => setLeadId(e.target.value)}
            className={inputCls}
          >
            <option value="">-- No Linked Lead --</option>
            {myLeads.map(l => {
              const c = db.contacts.find(con => con.id === l.contact_id)
              return (
                <option key={l.id} value={l.id}>
                  {c?.name || 'Lead'} • {l.property_interest || 'General'}
                </option>
              )
            })}
          </select>
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Due Date & Time *">
            <input
              type="datetime-local"
              required
              value={dueAt}
              onChange={e => setDueAt(e.target.value)}
              className={inputCls}
            />
          </Field>

          {timed ? (
            <Field label="End Time">
              <input
                type="datetime-local"
                value={endsAt}
                onChange={e => setEndsAt(e.target.value)}
                className={inputCls}
              />
            </Field>
          ) : (
            <Field label="Status">
              <select
                value={status}
                onChange={e => setStatus(e.target.value as any)}
                className={inputCls}
              >
                <option value="pending">Pending</option>
                <option value="done">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </Field>
          )}
        </div>

        <Field label="Description / Remarks (Optional)">
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            placeholder="Special instructions or notes for this task…"
            className={inputCls}
          />
        </Field>

        <ErrorText error={error} />

        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          {isEditing ? (
            <button
              type="button"
              onClick={handleDelete}
              className="text-xs font-semibold text-red-600 hover:underline"
            >
              Delete Task
            </button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Task'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
