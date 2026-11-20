import { useState, type FormEvent } from 'react'
import { Button, ErrorText, Field, inputCls, Modal, Segmented } from '../../components/ui'
import { useUser } from '../../lib/session'
import { db } from '../../lib/db'
import { isManager } from '../../lib/rules'
import { TASK_KIND_LABEL, TIMED_KINDS } from '../../lib/labels'
import { loadCustomTypes } from './TasksPage'
import { toLocalInput } from '../../lib/format'
import type { Task, TaskKind, TaskPriority } from '../../lib/types'
import { useLeads } from '../leads/api'
import { useProperties } from '../properties/api'
import { QUICK_DUE } from '../sales/SalesTaskModal'
import { useSaveTask, useSetTaskStatus, type TaskInput } from './api'

type Props = { open: boolean; onClose: () => void; task?: Task | null; defaults?: Partial<TaskInput> }

/** Create / edit a task. Shared by Tasks and Calendar (a calendar entry is a task with an end time). */
export function TaskModal({ open, onClose, task, defaults }: Props) {
  return (
    <Modal open={open} onClose={onClose} title={task ? 'Edit task' : 'New task'} wide>
      <TaskForm key={`${open}-${task?.id ?? defaults?.due_at ?? ''}`} task={task ?? null} defaults={defaults ?? {}} onDone={onClose} />
    </Modal>
  )
}

function TaskForm({ task, defaults, onDone }: { task: Task | null; defaults: Partial<TaskInput>; onDone: () => void }) {
  const user = useUser()
  const { data: leads = [] } = useLeads()
  const { data: properties = [] } = useProperties()
  const save = useSaveTask()
  const setStatus = useSetTaskStatus()
  const init = { ...defaults, ...task }
  const [kind, setKind] = useState<TaskKind>(init.kind ?? 'follow_up')
  const [priority, setPriority] = useState<TaskPriority>(init.priority ?? 'normal')
  const [due, setDue] = useState(() => toLocalInput(init.due_at ? new Date(init.due_at) : (() => { const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0); return d })()))
  const timed = TIMED_KINDS.includes(kind)
  const manager = isManager(user)
  const people = db.profiles.filter(p => p.active || p.id === init.assigned_to)

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const s = (k: string) => String(f.get(k) ?? '').trim()
    const lead_id = s('lead_id') || null
    const start = new Date(due)
    save.mutate(
      {
        id: task?.id,
        input: {
          title: s('title'), kind, lead_id, property_id: s('property_id') || null,
          // Editing keeps the current owner; a new task defaults to the lead's rep, then to me.
          assigned_to: s('assigned_to') || init.assigned_to || db.leads.find(l => l.id === lead_id)?.assigned_to || user.id,
          due_at: start.toISOString(),
          ends_at: timed ? (s('ends_at') ? new Date(s('ends_at')) : new Date(start.getTime() + 3600e3)).toISOString() : null,
          priority, description: s('description'),
        },
      },
      { onSuccess: onDone },
    )
  }
  const status = (st: Task['status']) => task && setStatus.mutate({ id: task.id, status: st }, { onSuccess: onDone })

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <Field label="Title *" className="sm:col-span-2"><input name="title" required defaultValue={init.title} className={inputCls} placeholder="Site visit with family" /></Field>
      <Field label="Type">
        <select value={kind} onChange={e => setKind(e.target.value as TaskKind)} className={inputCls}>
          {Object.entries(TASK_KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          {loadCustomTypes().map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
      </Field>
      {manager ? (
        <Field label="Assigned to">
          <select name="assigned_to" defaultValue={init.assigned_to ?? ''} className={inputCls}>
            <option value="">Lead's rep (or me)</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.full_name}{p.id === user.id ? ' (me)' : ''}</option>)}
          </select>
        </Field>
      ) : <span className="hidden sm:block" />}
      <Field label={timed ? 'Starts' : 'Due'} hint={task ? 'Change to reschedule' : undefined}>
        <input type="datetime-local" required value={due} onChange={e => setDue(e.target.value)} className={inputCls} />
      </Field>
      {timed ? (
        <Field label="Ends" hint="Blocks this slot on the calendar">
          <input
            name="ends_at"
            type="datetime-local"
            defaultValue={init.ends_at ? toLocalInput(new Date(init.ends_at)) : ''}
            placeholder="1 hour after start"
            className={inputCls}
          />
        </Field>
      ) : <span className="hidden sm:block" />}
      <div className="-mt-1 flex flex-wrap gap-1.5 sm:col-span-2">
        {QUICK_DUE.map(q => (
          <button key={q.label} type="button" onClick={() => setDue(toLocalInput(q.date()))} className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-200">
            {q.label}
          </button>
        ))}
      </div>
      <Field label="Lead">
        <select name="lead_id" defaultValue={init.lead_id ?? ''} className={inputCls}>
          <option value="">None</option>
          {leads.map(l => <option key={l.id} value={l.id}>{l.contact.name}</option>)}
        </select>
      </Field>
      <Field label="Property">
        <select name="property_id" defaultValue={init.property_id ?? ''} className={inputCls}>
          <option value="">None</option>
          {properties.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </Field>
      <div className="sm:col-span-2">
        <span className="mb-1.5 block text-xs font-medium text-slate-700">Priority</span>
        <Segmented
          label="Priority"
          value={priority}
          onChange={setPriority}
          items={[{ value: 'low', label: 'Low' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }, { value: 'urgent', label: 'Urgent' }]}
        />
      </div>
      <Field label="Notes (optional)" className="sm:col-span-2">
        <textarea name="description" rows={2} defaultValue={init.description ?? ''} className={inputCls} placeholder="What to cover, what to bring…" />
      </Field>
      <div className="-mx-5 -mb-5 flex flex-wrap items-center justify-end gap-2 rounded-b-xl border-t border-slate-100 bg-slate-50/60 px-5 py-3 sm:col-span-2">
        <ErrorText error={save.error ?? setStatus.error} />
        {task?.status === 'pending' && <>
          <Button variant="danger" onClick={() => status('cancelled')}>Cancel task</Button>
          <Button variant="secondary" onClick={() => status('done')}>Mark done</Button>
        </>}
        {task && task.status !== 'pending' && <Button variant="secondary" onClick={() => status('pending')}>Reopen</Button>}
        <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : task ? 'Save' : 'Create'}</Button>
      </div>
    </form>
  )
}
