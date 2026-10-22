import { useState, type FormEvent } from 'react'
import { Button, ErrorText, Field, inputCls, Modal } from '../../components/ui'
import { useUser } from '../../lib/session'
import { TASK_KIND_LABEL, TIMED_KINDS } from '../../lib/labels'
import { toLocalInput } from '../../lib/format'
import type { Task, TaskKind } from '../../lib/types'
import { useLeads } from '../leads/api'
import { useProperties } from '../properties/api'
import { useSaveTask, useSetTaskStatus, type TaskInput } from './api'

type Props = { open: boolean; onClose: () => void; task?: Task | null; defaults?: Partial<TaskInput> }

/** Create / edit a task. Shared by Tasks and Calendar (a calendar entry is a task with an end time). */
export function TaskModal({ open, onClose, task, defaults }: Props) {
  return (
    <Modal open={open} onClose={onClose} title={task ? 'Edit task' : 'New task'} wide>
      <TaskForm task={task ?? null} defaults={defaults ?? {}} onDone={onClose} />
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
  const start = init.due_at ? new Date(init.due_at) : (() => { const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0); return d })()
  const timed = TIMED_KINDS.includes(kind)

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const s = (k: string) => String(f.get(k) ?? '').trim()
    save.mutate(
      {
        id: task?.id,
        input: {
          title: s('title'), kind, lead_id: s('lead_id') || null, property_id: s('property_id') || null,
          assigned_to: user.id, due_at: new Date(s('due_at')).toISOString(), ends_at: s('ends_at') ? new Date(s('ends_at')).toISOString() : null,
        },
      },
      { onSuccess: onDone },
    )
  }
  const status = (st: Task['status']) => task && setStatus.mutate({ id: task.id, status: st }, { onSuccess: onDone })

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Title *" className="sm:col-span-2"><input name="title" required defaultValue={init.title} className={inputCls} placeholder="Site visit with family" /></Field>
      <Field label="Type">
        <select value={kind} onChange={e => setKind(e.target.value as TaskKind)} className={inputCls}>
          {Object.entries(TASK_KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
      <Field label={timed ? 'Starts' : 'Due'} hint={task ? 'Change this to reschedule — the lead timeline records the move' : undefined}>
        <input name="due_at" type="datetime-local" required defaultValue={toLocalInput(start)} className={inputCls} />
      </Field>
      <Field label={timed ? 'Ends *' : 'Ends (optional)'} hint={timed ? 'Blocks this slot; overlapping bookings are refused' : undefined}>
        <input
          key={String(timed)}
          name="ends_at"
          type="datetime-local"
          required={timed}
          defaultValue={init.ends_at ? toLocalInput(new Date(init.ends_at)) : timed ? toLocalInput(new Date(start.getTime() + 3600e3)) : ''}
          className={inputCls}
        />
      </Field>
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
      <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-2">
        <ErrorText error={save.error ?? setStatus.error} />
        {task?.status === 'pending' && <>
          <Button variant="danger" onClick={() => status('cancelled')}>Cancel task</Button>
          <Button variant="secondary" onClick={() => status('done')}>Mark done</Button>
        </>}
        {task && task.status !== 'pending' && <Button variant="secondary" onClick={() => status('pending')}>Reopen</Button>}
        <Button type="submit" disabled={save.isPending}>{task ? 'Save' : 'Create'}</Button>
      </div>
    </form>
  )
}
