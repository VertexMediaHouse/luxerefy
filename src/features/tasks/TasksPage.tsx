import { useState } from 'react'
import { Link } from 'react-router'
import { Check, CheckSquare, Plus } from 'lucide-react'
import { Avatar, Badge, Button, Card, Empty, inlineInputCls, Loading, PageHeader, RecordCount, SearchBox, Tabs, Toolbar } from '../../components/ui'
import { useProfiles, useUser } from '../../lib/session'
import { isManager } from '../../lib/rules'
import { TASK_KIND_LABEL, TASK_KIND_TONE } from '../../lib/labels'
import { dateTime } from '../../lib/format'
import type { Task } from '../../lib/types'
import { isOverdue, useSetTaskStatus, useTasks } from './api'
import { TaskModal } from './TaskModal'

type View = 'pending' | 'overdue' | 'done' | 'all'

export function TasksPage() {
  const user = useUser()
  const mgr = isManager(user)
  const { data } = useTasks()
  const { data: profiles } = useProfiles()
  const setStatus = useSetTaskStatus()
  const [view, setView] = useState<View>('pending')
  const [agent, setAgent] = useState('')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Task | null | 'new'>(null)
  if (!data) return <Loading />

  const needle = q.toLowerCase()
  const base = data.filter(t => t.status !== 'cancelled' && (!agent || t.assigned_to === agent) && (!needle || [t.title, t.lead_name, t.property_title].some(v => v?.toLowerCase().includes(needle))))
  const match: Record<View, (t: Task) => boolean> = { pending: t => t.status === 'pending', overdue: isOverdue, done: t => t.status === 'done', all: () => true }
  const rows = base.filter(match[view])
  if (view === 'done' || view === 'all') rows.reverse() // newest first for history

  return (
    <>
      <PageHeader icon={CheckSquare} tint="text-violet-500"
        title="Tasks"
        subtitle={mgr ? 'Follow-ups, documents and approvals across the team' : 'Everything assigned to you'}
        actions={<Button onClick={() => setEditing('new')}><Plus className="size-4" /> New task</Button>}
      />
      <Card>
        <Toolbar>
        <Tabs value={view} onChange={setView} items={(['pending', 'overdue', 'done', 'all'] as const).map(v => ({ value: v, label: v[0].toUpperCase() + v.slice(1), count: base.filter(match[v]).length }))} />
        <div className="flex flex-wrap gap-2">
          <SearchBox value={q} onChange={setQ} placeholder="Search tasks" label="Search tasks" className="min-w-48 flex-1" />
          {mgr && (
            <select value={agent} onChange={e => setAgent(e.target.value)} className={`${inlineInputCls}`} aria-label="Filter by person">
              <option value="">Everyone</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          )}
        </div>
        </Toolbar>
        <ul className="divide-y divide-slate-100">
          {rows.map(t => {
            const overdue = isOverdue(t)
            return (
              <li key={t.id} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-slate-50">
                <button
                  type="button"
                  onClick={() => setStatus.mutate({ id: t.id, status: t.status === 'done' ? 'pending' : 'done' })}
                  aria-label={t.status === 'done' ? `Reopen "${t.title}"` : `Mark "${t.title}" done`}
                  className={`flex size-5 shrink-0 items-center justify-center rounded-full ring-1 transition ${t.status === 'done' ? 'bg-emerald-500 text-white ring-emerald-500' : 'text-transparent ring-slate-300 hover:bg-emerald-500 hover:text-white hover:ring-emerald-500'}`}
                >
                  <Check className="size-3.5" />
                </button>
                <button type="button" onClick={() => setEditing(t)} className="min-w-0 flex-1 text-left">
                  <span className={`block truncate text-sm font-medium ${t.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{t.title}</span>
                  <span className={`block text-xs ${overdue ? 'font-semibold text-red-600' : 'text-slate-500'}`}>
                    {overdue && 'Overdue, '}{dateTime(t.due_at)}{t.ends_at && ` – ${new Date(t.ends_at).toLocaleTimeString('en-IN', { timeStyle: 'short' })}`}
                  </span>
                </button>
                <span className="hidden max-w-56 truncate text-xs text-slate-500 md:block">
                  {t.lead_id ? <Link to={`/leads/${t.lead_id}`} className="font-semibold text-blue-700 hover:underline">{t.lead_name}</Link> : null}
                  {t.lead_id && t.property_title ? ', ' : ''}{t.property_title}
                </span>
                <Badge tone={TASK_KIND_TONE[t.kind]}>{TASK_KIND_LABEL[t.kind]}</Badge>
                {mgr && <span title={t.assignee_name} className="hidden sm:block"><Avatar name={t.assignee_name} size="sm" /></span>}
              </li>
            )
          })}
        </ul>
        {rows.length ? <RecordCount shown={rows.length} total={base.length} noun="tasks" /> : <Empty icon={CheckSquare}>{view === 'overdue' ? 'Nothing overdue.' : 'No tasks here.'}</Empty>}
      </Card>

      <TaskModal open={!!editing} onClose={() => setEditing(null)} task={editing === 'new' ? null : editing} />
    </>
  )
}
