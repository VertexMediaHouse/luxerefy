import { useState } from 'react'
import { Link } from 'react-router'
import { AlertTriangle, Check, CheckCircle2, CheckSquare, Clock, Plus } from 'lucide-react'
import { Badge, Button, Card, CardHeader, Empty, Loading, PageHeader, SearchBox } from '../../components/ui'
import { TASK_KIND_LABEL, TASK_KIND_TONE } from '../../lib/labels'
import { dateTime } from '../../lib/format'
import type { Task } from '../../lib/types'
import { isOverdue, useSetTaskStatus, useTasks, type TaskRow } from './api'
import { TaskModal } from './TaskModal'

/** Three buckets, side by side. Pending excludes overdue so nothing is counted twice. */
const COLUMNS = [
  { key: 'pending', label: 'Pending', icon: Clock, match: (t: Task) => t.status === 'pending' && !isOverdue(t) },
  { key: 'overdue', label: 'Overdue', icon: AlertTriangle, match: isOverdue },
  { key: 'done', label: 'Completed', icon: CheckCircle2, match: (t: Task) => t.status === 'done' },
] as const

export function TasksPage() {
  const { data } = useTasks()
  const setStatus = useSetTaskStatus()
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Task | null | 'new'>(null)
  if (!data) return <Loading />

  const needle = q.toLowerCase()
  const base = data.filter(t => t.status !== 'cancelled' && (!needle || [t.title, t.lead_name, t.property_title].some(v => v?.toLowerCase().includes(needle))))

  return (
    <>
      <PageHeader icon={CheckSquare}
        title="Tasks"
        subtitle="Follow-ups, documents and approvals, split by where they stand"
        actions={<>
          <SearchBox value={q} onChange={setQ} placeholder="Search tasks" label="Search tasks" className="w-full sm:w-64" />
          <Button onClick={() => setEditing('new')}><Plus className="size-4" /> New task</Button>
        </>}
      />

      <div className="grid items-start gap-4 lg:grid-cols-3">
        {COLUMNS.map(({ key, label, icon, match }) => {
          const rows = base.filter(match)
          if (key === 'done') rows.reverse() // most recently finished first
          return (
            <Card key={key} className="flex flex-col">
              <CardHeader
                icon={icon}
                title={label}
                subtitle={`${rows.length} ${rows.length === 1 ? 'task' : 'tasks'}`}
              />
              {rows.length ? (
                <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
                  {rows.map(t => <TaskLine key={t.id} t={t} overdue={key === 'overdue'} onOpen={() => setEditing(t)} onToggle={() => setStatus.mutate({ id: t.id, status: t.status === 'done' ? 'pending' : 'done' })} />)}
                </ul>
              ) : (
                <Empty icon={icon}>{key === 'overdue' ? 'Nothing overdue.' : key === 'done' ? 'Nothing finished yet.' : 'Nothing pending.'}</Empty>
              )}
            </Card>
          )
        })}
      </div>

      {setStatus.error && <p role="alert" className="mt-4 text-sm font-medium text-red-600">{(setStatus.error as Error).message}</p>}
      <TaskModal open={!!editing} onClose={() => setEditing(null)} task={editing === 'new' ? null : editing} />
    </>
  )
}

function TaskLine({ t, overdue, onOpen, onToggle }: { t: TaskRow; overdue: boolean; onOpen: () => void; onToggle: () => void }) {
  const done = t.status === 'done'
  return (
    <li className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50">
      <button
        type="button"
        onClick={onToggle}
        aria-label={done ? `Reopen "${t.title}"` : `Mark "${t.title}" done`}
        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ring-1 transition ${done ? 'bg-emerald-500 text-white ring-emerald-500' : 'text-transparent ring-slate-300 hover:bg-emerald-500 hover:text-white hover:ring-emerald-500'}`}
      >
        <Check className="size-3.5" />
      </button>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className={`block truncate text-sm font-medium ${done ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{t.title}</span>
        <span className={`block text-xs ${overdue ? 'font-semibold text-red-600' : 'text-slate-500'}`}>
          {dateTime(t.due_at)}{t.ends_at && ` – ${new Date(t.ends_at).toLocaleTimeString('en-IN', { timeStyle: 'short' })}`}
        </span>
        {(t.lead_name || t.property_title) && (
          <span className="mt-0.5 block truncate text-xs text-slate-400">
            {t.lead_id ? <Link to={`/leads/${t.lead_id}`} onClick={e => e.stopPropagation()} className="font-medium text-slate-600 hover:underline">{t.lead_name}</Link> : null}
            {t.lead_id && t.property_title ? ' · ' : ''}{t.property_title}
          </span>
        )}
      </button>
      <Badge tone={TASK_KIND_TONE[t.kind]}>{TASK_KIND_LABEL[t.kind]}</Badge>
    </li>
  )
}
