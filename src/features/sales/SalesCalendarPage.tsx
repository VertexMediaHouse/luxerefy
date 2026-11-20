import { useState, useMemo } from 'react'
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  inlineInputCls,
  PageHeader,
  Segmented,
} from '../../components/ui'
import { useUser } from '../../lib/session'
import { db, write, ok } from '../../lib/db'
import { supabase } from '../../lib/supabase'
import { TASK_KIND_LABEL } from '../../lib/labels'
import { isOverdue, useSetTaskStatus } from '../tasks/api'
import { SalesTaskModal } from './SalesTaskModal'
import type { Task, TaskKind } from '../../lib/types'

const addDays = (d: Date, n: number) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
const startOfDay = (d: Date) => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
const startOfWeek = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7)) // Monday start
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
const timeFmt = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })

const CHIP_COLOR: Record<TaskKind, string> = {
  call: 'border-blue-500 bg-blue-50 text-blue-900',
  text: 'border-violet-500 bg-violet-50 text-violet-900',
  follow_up: 'border-sky-500 bg-sky-50 text-sky-900',
  site_visit: 'border-emerald-500 bg-emerald-50 text-emerald-900',
  meeting: 'border-indigo-600 bg-indigo-50 text-indigo-900',
  other: 'border-slate-400 bg-slate-50 text-slate-800',
}

export function SalesCalendarPage() {
  const user = useUser()
  const setTaskStatus = useSetTaskStatus()

  const [view, setView] = useState<'month' | 'week' | 'day'>('week')
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()))
  const [kindFilter, setKindFilter] = useState<string>('')
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [creatingDue, setCreatingDue] = useState<Date | null>(null)

  // SECURITY: Strictly scoped to own tasks
  const myTasks = useMemo(() => {
    return db.tasks.filter(
      t => t.assigned_to === user.id && t.status !== 'cancelled' && (!kindFilter || t.kind === kindFilter),
    )
  }, [user.id, kindFilter])

  // Calendar dates calculation
  const days = useMemo(() => {
    if (view === 'day') return [anchor]
    if (view === 'week') {
      const first = startOfWeek(anchor)
      return Array.from({ length: 7 }, (_, i) => addDays(first, i))
    }
    // Month: 42 days grid starting on Monday
    const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    const first = startOfWeek(firstOfMonth)
    return Array.from({ length: 42 }, (_, i) => addDays(first, i))
  }, [view, anchor])

  const step = (delta: number) => {
    setAnchor(prev => {
      if (view === 'day') return addDays(prev, delta)
      if (view === 'week') return addDays(prev, 7 * delta)
      return new Date(prev.getFullYear(), prev.getMonth() + delta, 1)
    })
  }

  const label = useMemo(() => {
    if (view === 'day') {
      return anchor.toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    }
    if (view === 'week') {
      return `${days[0].toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString(
        'en-IN',
        { day: 'numeric', month: 'short', year: 'numeric' },
      )}`
    }
    return anchor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  }, [view, anchor, days])

  const onDay = (d: Date) => myTasks.filter(t => sameDay(new Date(t.due_at), d))

  // Drag-and-drop reschedule support
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = async (e: React.DragEvent, targetDate: Date) => {
    e.preventDefault()
    const taskId = e.dataTransfer.getData('text/plain')
    const task = myTasks.find(t => t.id === taskId)
    if (!task) return

    const oldDate = new Date(task.due_at)
    const newDate = new Date(targetDate)
    newDate.setHours(oldDate.getHours(), oldDate.getMinutes(), 0, 0)

    let endsIso = null
    if (task.ends_at) {
      const oldEnds = new Date(task.ends_at)
      const diff = oldEnds.getTime() - oldDate.getTime()
      endsIso = new Date(newDate.getTime() + diff).toISOString()
    }

    await write(async () => {
      ok(
        await supabase
          .from('tasks')
          .update({ due_at: newDate.toISOString(), ends_at: endsIso })
          .eq('id', taskId),
      )
    })
  }

  return (
    <>
      <PageHeader
        icon={CalendarDays}
        title="My Schedule & Follow-ups"
        subtitle="Manage upcoming calls, client meetings, and booked site visits"
        actions={
          <Button
            onClick={() => {
              setEditingTask(null)
              setCreatingDue(new Date())
            }}
          >
            <Plus className="size-4" /> Book Event
          </Button>
        }
      />

      {/* Navigation Toolbar */}
      <Card className="mb-4 flex flex-col gap-3 p-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" className="px-2" onClick={() => step(-1)} aria-label="Previous">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="secondary" onClick={() => setAnchor(startOfDay(new Date()))}>
            Today
          </Button>
          <Button variant="secondary" className="px-2" onClick={() => step(1)} aria-label="Next">
            <ChevronRight className="size-4" />
          </Button>
          <h2 className="ml-2 text-base font-semibold text-slate-900">{label}</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Calendar view"
            value={view}
            onChange={setView}
            items={[
              { value: 'day', label: 'Day' },
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
            ]}
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
      </Card>

      {/* Calendar Grid */}
      <Card className="overflow-hidden">
        {view === 'day' ? (
          /* Day View */
          <div className="p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">Events & Follow-ups for Today</h3>
            {onDay(anchor).length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">
                No events scheduled for this day.{' '}
                <button
                  type="button"
                  onClick={() => setCreatingDue(anchor)}
                  className="font-semibold text-blue-600 hover:underline"
                >
                  Click here to add one.
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {onDay(anchor).map(t => {
                  const overdue = isOverdue(t)
                  const isDone = t.status === 'done'
                  return (
                    <div
                      key={t.id}
                      onClick={() => setEditingTask(t)}
                      className={`flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 cursor-pointer ${
                        overdue ? 'bg-red-50/50' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation()
                            setTaskStatus.mutate({ id: t.id, status: isDone ? 'pending' : 'done' })
                          }}
                          className={`size-5 rounded border flex items-center justify-center ${
                            isDone ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300'
                          }`}
                        >
                          {isDone && <Check className="size-3" />}
                        </button>
                        <div>
                          <div className={`font-semibold text-sm ${isDone ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                            {t.title}
                          </div>
                          <div className="text-xs text-slate-400">
                            {timeFmt(t.due_at)} {t.ends_at && `– ${timeFmt(t.ends_at)}`} • {TASK_KIND_LABEL[t.kind]}
                          </div>
                        </div>
                      </div>
                      <Badge tone={overdue ? 'red' : isDone ? 'green' : 'blue'}>
                        {overdue ? 'Overdue' : isDone ? 'Done' : 'Pending'}
                      </Badge>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          /* Week / Month Grid */
          <div>
            {/* Header row with day names */}
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-semibold text-slate-600 py-2">
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
              <span>Sun</span>
            </div>

            {/* Day slots */}
            <div className="grid grid-cols-7 divide-x divide-y divide-slate-100">
              {days.map((d) => {
                const dayTasks = onDay(d)
                const isTodayDate = sameDay(d, new Date())
                const inMonth = d.getMonth() === anchor.getMonth()

                return (
                  <div
                    key={d.toISOString()}
                    onDragOver={handleDragOver}
                    onDrop={e => handleDrop(e, d)}
                    onClick={() => setCreatingDue(d)}
                    className={`min-h-[7.5rem] p-1.5 transition-colors cursor-pointer hover:bg-slate-50/70 ${
                      !inMonth && view === 'month' ? 'bg-slate-50/40 text-slate-400' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between pb-1">
                      <span
                        className={`size-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                          isTodayDate ? 'bg-blue-600 text-white' : 'text-slate-700'
                        }`}
                      >
                        {d.getDate()}
                      </span>
                      {dayTasks.length > 0 && (
                        <span className="text-[10px] font-bold text-slate-400">{dayTasks.length}</span>
                      )}
                    </div>

                    <div className="space-y-1">
                      {dayTasks.slice(0, 3).map(t => {
                        const overdue = isOverdue(t)
                        const isDone = t.status === 'done'
                        return (
                          <div
                            key={t.id}
                            draggable
                            onDragStart={e => handleDragStart(e, t.id)}
                            onClick={e => {
                              e.stopPropagation()
                              setEditingTask(t)
                            }}
                            className={`rounded border-l-[3px] p-1 text-[11px] leading-tight font-medium shadow-xs transition hover:opacity-90 ${
                              CHIP_COLOR[t.kind]
                            } ${isDone ? 'opacity-50 line-through' : ''} ${
                              overdue ? 'ring-1 ring-red-500' : ''
                            }`}
                            title={`Drag to reschedule or click to view: ${t.title}`}
                          >
                            <div className="font-semibold truncate">
                              {timeFmt(t.due_at)} {t.title}
                            </div>
                          </div>
                        )
                      })}
                      {dayTasks.length > 3 && (
                        <div className="text-[10px] text-slate-400 font-semibold text-center">
                          +{dayTasks.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </Card>

      {/* Task Modal */}
      {(editingTask || creatingDue) && (
        <SalesTaskModal
          open={!!(editingTask || creatingDue)}
          onClose={() => {
            setEditingTask(null)
            setCreatingDue(null)
          }}
          task={editingTask}
          defaultDue={creatingDue}
        />
      )}
    </>
  )
}
