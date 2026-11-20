import { useState, useMemo } from 'react'
import { Link } from 'react-router'
import {
  Check,
  CheckSquare,
  KanbanSquare,
  List,
  Plus,
  ShieldCheck,
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  Empty,
  inlineInputCls,
  PageHeader,
  SearchBox,
  Segmented,
  T,
  Tabs,
} from '../../components/ui'
import { useUser } from '../../lib/session'
import { db, write, ok } from '../../lib/db'
import { supabase } from '../../lib/supabase'
import { TASK_KIND_LABEL, TASK_PRIORITY_LABEL, TASK_PRIORITY_TONE } from '../../lib/labels'
import { dateTime } from '../../lib/format'
import { isOverdue, useSetTaskStatus, useTasks } from '../tasks/api'
import { SalesTaskModal } from './SalesTaskModal'
import type { Task } from '../../lib/types'

type FilterTab = 'all' | 'today' | 'upcoming' | 'overdue' | 'completed'

export function SalesTasksPage() {
  const user = useUser()
  const setTaskStatus = useSetTaskStatus()

  const [view, setView] = useState<'list' | 'kanban'>('list')
  const [filterTab, setFilterTab] = useState<FilterTab>('all')
  const [kindFilter, setKindFilter] = useState<string>('')
  const [search, setSearch] = useState('')
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  // useTasks() re-renders this page whenever the mirror refreshes.
  useTasks()
  const myTasks = db.tasks.filter(t => t.assigned_to === user.id && t.status !== 'cancelled')

  const todayStr = new Date().toISOString().slice(0, 10)

  const isToday = (t: Task) => t.status === 'pending' && t.due_at.slice(0, 10) === todayStr
  const isUpcoming = (t: Task) => t.status === 'pending' && t.due_at.slice(0, 10) > todayStr
  const isOverdueTask = (t: Task) => isOverdue(t)
  const isCompleted = (t: Task) => t.status === 'done'

  // Filter counts
  const counts = {
    all: myTasks.length,
    today: myTasks.filter(isToday).length,
    upcoming: myTasks.filter(isUpcoming).length,
    overdue: myTasks.filter(isOverdueTask).length,
    completed: myTasks.filter(isCompleted).length,
  }

  // Filtered rows
  const filtered = useMemo(() => {
    return myTasks
      .filter(t => {
        if (filterTab === 'today' && !isToday(t)) return false
        if (filterTab === 'upcoming' && !isUpcoming(t)) return false
        if (filterTab === 'overdue' && !isOverdueTask(t)) return false
        if (filterTab === 'completed' && !isCompleted(t)) return false

        if (kindFilter && t.kind !== kindFilter) return false

        if (search) {
          const needle = search.toLowerCase()
          const lead = db.leads.find(l => l.id === t.lead_id)
          const contact = lead ? db.contacts.find(c => c.id === lead.contact_id) : null
          const matchTitle = t.title.toLowerCase().includes(needle)
          const matchContact = contact?.name?.toLowerCase().includes(needle)
          if (!matchTitle && !matchContact) return false
        }
        return true
      })
      .sort((a, b) => a.due_at.localeCompare(b.due_at))
  }, [myTasks, filterTab, kindFilter, search])

  // Bulk actions
  const handleBulkComplete = async () => {
    if (selectedTaskIds.size === 0) return
    const ids = Array.from(selectedTaskIds)
    await write(async () => {
      ok(await supabase.from('tasks').update({ status: 'done' }).in('id', ids))
    })
    setSelectedTaskIds(new Set())
  }

  const handleToggleDone = (task: Task, e: React.MouseEvent) => {
    e.stopPropagation()
    const nextStatus = task.status === 'done' ? 'pending' : 'done'
    setTaskStatus.mutate({ id: task.id, status: nextStatus })
  }

  // Kanban column definitions
  const kanbanColumns = [
    { key: 'pending', label: 'To-Do (Pending)', filter: (t: Task) => t.status === 'pending' && !isOverdue(t) },
    { key: 'overdue', label: 'Overdue Action Needed', filter: isOverdueTask, alert: true },
    { key: 'done', label: 'Completed', filter: (t: Task) => t.status === 'done' },
  ]

  return (
    <>
      <PageHeader
        icon={CheckSquare}
        title="Tasks & Follow-ups"
        subtitle="Manage your daily calls, client follow-ups, and scheduled site visits"
        actions={
          <Button
            onClick={() => {
              setEditingTask(null)
              setModalOpen(true)
            }}
          >
            <Plus className="size-4" /> Create Task
          </Button>
        }
      />

      {/* Toolbar & Filters */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="View mode"
            value={view}
            onChange={setView}
            items={[
              { value: 'list', label: 'List', icon: List },
              { value: 'kanban', label: 'Kanban', icon: KanbanSquare },
            ]}
          />

          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search tasks or client name…"
            label="Search tasks"
            className="w-full sm:w-64"
          />

          <select
            value={kindFilter}
            onChange={e => setKindFilter(e.target.value)}
            className={inlineInputCls}
            aria-label="Filter by type"
          >
            <option value="">All Types</option>
            {Object.entries(TASK_KIND_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {selectedTaskIds.size > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white">
            <span>{selectedTaskIds.size} selected</span>
            <button
              type="button"
              onClick={handleBulkComplete}
              className="rounded bg-blue-600 px-2 py-0.5 font-semibold text-white hover:bg-blue-500"
            >
              Mark Done
            </button>
            <button
              type="button"
              onClick={() => setSelectedTaskIds(new Set())}
              className="text-slate-400 hover:text-white underline ml-1"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {view === 'list' ? (
        <Card>
          <div className="border-b border-slate-100 px-4 pt-2">
            <Tabs
              value={filterTab}
              onChange={setFilterTab}
              items={[
                { value: 'all', label: 'All', count: counts.all },
                { value: 'today', label: 'Due Today', count: counts.today },
                { value: 'upcoming', label: 'Upcoming', count: counts.upcoming },
                { value: 'overdue', label: 'Overdue', count: counts.overdue },
                { value: 'completed', label: 'Completed', count: counts.completed },
              ]}
            />
          </div>

          {filtered.length === 0 ? (
            <Empty icon={CheckSquare}>No tasks matching your current filter.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className={T.table}>
                <thead className={T.head}>
                  <tr>
                    <th className="w-10 px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={filtered.length > 0 && selectedTaskIds.size === filtered.length}
                        onChange={() => {
                          if (selectedTaskIds.size === filtered.length) setSelectedTaskIds(new Set())
                          else setSelectedTaskIds(new Set(filtered.map(t => t.id)))
                        }}
                        className="size-4 rounded accent-blue-600 cursor-pointer"
                        aria-label="Select all tasks"
                      />
                    </th>
                    <th className={T.th}>Task</th>
                    <th className={T.th}>Type</th>
                    <th className={T.th}>Priority</th>
                    <th className={T.th}>Linked Lead</th>
                    <th className={T.th}>Due Date</th>
                    <th className={T.th}>Status</th>
                  </tr>
                </thead>
                <tbody className={T.body}>
                  {filtered.map(t => {
                    const lead = db.leads.find(l => l.id === t.lead_id)
                    const contact = lead ? db.contacts.find(c => c.id === lead.contact_id) : null
                    const overdue = isOverdue(t)
                    const isDone = t.status === 'done'
                    const isAssignedByAdmin = t.created_by && t.created_by !== user.id

                    return (
                      <tr
                        key={t.id}
                        onClick={() => {
                          setEditingTask(t)
                          setModalOpen(true)
                        }}
                        className={`${T.row} ${isDone ? 'opacity-60 bg-slate-50/50' : ''}`}
                      >
                        <td className="w-10 px-3 py-2.5" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedTaskIds.has(t.id)}
                            onChange={() => {
                              setSelectedTaskIds(prev => {
                                const next = new Set(prev)
                                if (next.has(t.id)) next.delete(t.id)
                                else next.add(t.id)
                                return next
                              })
                            }}
                            className="size-4 rounded accent-blue-600 cursor-pointer"
                            aria-label={`Select ${t.title}`}
                          />
                        </td>

                        <td className={T.td}>
                          <div className="flex items-center gap-2.5">
                            <button
                              type="button"
                              onClick={e => handleToggleDone(t, e)}
                              className={`size-4.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                isDone
                                  ? 'bg-emerald-600 border-emerald-600 text-white'
                                  : 'border-slate-300 hover:border-emerald-500 hover:bg-emerald-50'
                              }`}
                              title={isDone ? 'Mark as pending' : 'Mark as completed'}
                            >
                              {isDone && <Check className="size-3" />}
                            </button>

                            <div>
                              <span className={`font-semibold text-slate-900 ${isDone ? 'line-through text-slate-400' : ''}`}>
                                {t.title}
                              </span>
                              {isAssignedByAdmin && (
                                <span className="ml-2 inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                                  <ShieldCheck className="size-3" /> Assigned by admin
                                </span>
                              )}
                              {t.description && (
                                <p className="text-xs text-slate-400 truncate max-w-md">{t.description}</p>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className={T.td}>
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 capitalize">
                            {TASK_KIND_LABEL[t.kind]}
                          </span>
                        </td>

                        <td className={T.td}>
                          <Badge tone={TASK_PRIORITY_TONE[t.priority || 'normal']}>
                            {TASK_PRIORITY_LABEL[t.priority || 'normal']}
                          </Badge>
                        </td>

                        <td className={T.td} onClick={e => e.stopPropagation()}>
                          {lead && contact ? (
                            <Link
                              to={`/sales/leads/${lead.id}`}
                              className="text-xs font-semibold text-blue-600 hover:underline block truncate max-w-36"
                            >
                              {contact.name}
                            </Link>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>

                        <td className={T.td}>
                          <span className={`text-xs font-medium ${overdue ? 'text-red-600 font-semibold' : 'text-slate-600'}`}>
                            {dateTime(t.due_at)}
                          </span>
                        </td>

                        <td className={T.td}>
                          {overdue ? (
                            <Badge tone="red">Overdue</Badge>
                          ) : isDone ? (
                            <Badge tone="green">Completed</Badge>
                          ) : (
                            <Badge tone="blue">Pending</Badge>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        /* Kanban View */
        <div className="grid gap-4 md:grid-cols-3">
          {kanbanColumns.map(col => {
            const colTasks = myTasks.filter(col.filter)
            return (
              <div key={col.key} className="flex flex-col rounded-xl bg-slate-100/70 p-3 border border-slate-200/80">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    {col.label}
                  </h3>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-600 shadow-xs">
                    {colTasks.length}
                  </span>
                </div>

                <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[calc(100vh-20rem)] pr-0.5">
                  {colTasks.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-white/50 p-6 text-center text-xs text-slate-400">
                      No tasks in this lane
                    </div>
                  ) : (
                    colTasks.map(t => {
                      const lead = db.leads.find(l => l.id === t.lead_id)
                      const contact = lead ? db.contacts.find(c => c.id === lead.contact_id) : null
                      return (
                        <div
                          key={t.id}
                          onClick={() => {
                            setEditingTask(t)
                            setModalOpen(true)
                          }}
                          className="rounded-lg bg-white p-3.5 shadow-sm border border-slate-200 hover:border-blue-400 cursor-pointer transition-all space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-900 leading-snug">
                              {t.title}
                            </span>
                            <button
                              type="button"
                              onClick={e => handleToggleDone(t, e)}
                              className={`size-4 rounded border shrink-0 flex items-center justify-center ${
                                t.status === 'done'
                                  ? 'bg-emerald-600 border-emerald-600 text-white'
                                  : 'border-slate-300 hover:border-emerald-500'
                              }`}
                            >
                              {t.status === 'done' && <Check className="size-2.5" />}
                            </button>
                          </div>

                          {contact && (
                            <div className="text-[11px] text-slate-500 font-medium truncate">
                              Lead: {contact.name}
                            </div>
                          )}

                          <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px]">
                            <span className="text-slate-400">{dateTime(t.due_at)}</span>
                            <Badge tone={TASK_PRIORITY_TONE[t.priority || 'normal']}>
                              {TASK_PRIORITY_LABEL[t.priority || 'normal']}
                            </Badge>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modalOpen && (
        <SalesTaskModal
          open={modalOpen}
          onClose={() => {
            setModalOpen(false)
            setEditingTask(null)
          }}
          task={editingTask}
        />
      )}
    </>
  )
}
