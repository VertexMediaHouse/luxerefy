import { useState } from 'react'
import { Link } from 'react-router'
import { AlertTriangle, CalendarClock, Check, CheckCircle2, CheckSquare, Clock, Plus, Settings2, Trash2 } from 'lucide-react'
import { Badge, Button, Card, CardHeader, Empty, Field, inputCls, Loading, Modal, PageHeader, SearchBox } from '../../components/ui'
import { TASK_KIND_LABEL, TASK_KIND_TONE } from '../../lib/labels'
import { dateTime } from '../../lib/format'
import type { Task, TaskKind } from '../../lib/types'
import { isOverdue, useSetTaskStatus, useTasks, type TaskRow } from './api'
import { TaskModal } from './TaskModal'

const isFuture = (t: Task) => t.status === 'pending' && Date.parse(t.due_at) > new Date().setHours(23, 59, 59, 999)

const COLUMNS = [
  { key: 'pending', label: 'Pending', icon: Clock, match: (t: Task) => t.status === 'pending' && !isOverdue(t) && !isFuture(t) },
  { key: 'overdue', label: 'Overdue', icon: AlertTriangle, match: isOverdue },
  { key: 'done', label: 'Completed', icon: CheckCircle2, match: (t: Task) => t.status === 'done' },
  { key: 'future', label: 'In Future', icon: CalendarClock, match: isFuture },
] as const

const STATUS_THEME: Record<string, {
  color: string
  bgLight: string
  border: string
  ring: string
  dot: string
  badgeTone: 'blue' | 'red' | 'green' | 'slate'
  subtext: string
}> = {
  pending: {
    color: '#2563eb',
    bgLight: 'bg-blue-50/50 hover:bg-blue-50/80',
    border: 'border-blue-200/70',
    ring: 'hover:ring-blue-300',
    dot: 'bg-blue-600',
    badgeTone: 'blue',
    subtext: 'Active & due today',
  },
  overdue: {
    color: '#ef4444',
    bgLight: 'bg-red-50/50 hover:bg-red-50/80',
    border: 'border-red-200/70',
    ring: 'hover:ring-red-300',
    dot: 'bg-red-500',
    badgeTone: 'red',
    subtext: 'Immediate action needed',
  },
  done: {
    color: '#10b981',
    bgLight: 'bg-emerald-50/50 hover:bg-emerald-50/80',
    border: 'border-emerald-200/70',
    ring: 'hover:ring-emerald-300',
    dot: 'bg-emerald-500',
    badgeTone: 'green',
    subtext: 'Successfully closed',
  },
  future: {
    color: '#64748b',
    bgLight: 'bg-slate-50/70 hover:bg-slate-100/70',
    border: 'border-slate-200/80',
    ring: 'hover:ring-slate-300',
    dot: 'bg-slate-400',
    badgeTone: 'slate',
    subtext: 'Scheduled for later',
  },
}

function scrollToTaskColumn(key: string) {
  const el = document.getElementById(`task-col-${key}`)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    el.classList.add('ring-2', 'ring-blue-500', 'shadow-md')
    setTimeout(() => {
      el.classList.remove('ring-2', 'ring-blue-500', 'shadow-md')
    }, 1200)
  }
}

/** Executive overview for tasks: interactive donut, dynamic center stat, health cards and progress track. */
function TaskOverview({ counts }: { counts: Record<string, number> }) {
  const [hovered, setHovered] = useState<string | null>(null)

  const slices = COLUMNS.map(c => ({
    key: c.key,
    label: c.label,
    icon: c.icon,
    count: counts[c.key] ?? 0,
    theme: STATUS_THEME[c.key],
  }))

  const total = slices.reduce((s, sl) => s + sl.count, 0)
  const doneCount = counts['done'] ?? 0
  const overdueCount = counts['overdue'] ?? 0
  const completionRate = total > 0 ? Math.round((doneCount / total) * 100) : 0

  if (!total) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center text-slate-500">
        <CheckSquare className="size-8 text-slate-300" />
        <p className="mt-2 text-sm font-medium">No tasks found matching your filters</p>
      </div>
    )
  }

  const R = 44
  const C = 2 * Math.PI * R
  const activeSlices = slices.filter(s => s.count > 0)
  const gap = activeSlices.length > 1 ? 2.5 : 0

  let currentOffset = 0
  const sliceElements = activeSlices.map(sl => {
    const len = (sl.count / total) * C
    const strokeLen = Math.max(0.5, len - gap)
    const isFocused = hovered === sl.key
    const isDimmed = hovered != null && !isFocused

    const el = (
      <circle
        key={sl.key}
        cx="60"
        cy="60"
        r={R}
        fill="none"
        stroke={sl.theme.color}
        strokeWidth={isFocused ? 14 : 11}
        strokeDasharray={`${strokeLen} ${C - strokeLen}`}
        strokeDashoffset={-(currentOffset + gap / 2)}
        className="cursor-pointer transition-all duration-200"
        style={{
          opacity: isDimmed ? 0.35 : 1,
          filter: isFocused ? `drop-shadow(0 2px 6px ${sl.theme.color}55)` : undefined,
        }}
        onMouseEnter={() => setHovered(sl.key)}
        onMouseLeave={() => setHovered(null)}
        onClick={() => scrollToTaskColumn(sl.key)}
      />
    )
    currentOffset += len
    return el
  })

  const activeHoverItem = hovered ? slices.find(s => s.key === hovered) : null

  return (
    <div className="space-y-5">
      {/* Overview Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-slate-900">Task health & breakdown</h2>
          <p className="text-xs text-slate-500">
            {total} total tasks · {doneCount} completed ({completionRate}%)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {overdueCount > 0 ? (
            <Badge tone="red">{overdueCount} overdue</Badge>
          ) : (
            <Badge tone="green">No overdue tasks</Badge>
          )}
          <span className="hidden text-xs text-slate-400 sm:inline">· Click any metric to jump to column</span>
        </div>
      </div>

      {/* Main interactive section: Donut + Stat Grid */}
      <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-12">
        {/* Donut Chart with Interactive Center */}
        <div className="flex flex-col items-center justify-center md:col-span-5 lg:col-span-4">
          <div className="relative size-44">
            <svg viewBox="0 0 120 120" className="size-full -rotate-90">
              <circle
                cx="60"
                cy="60"
                r={R}
                fill="none"
                stroke="#eef2f8"
                strokeWidth="11"
              />
              {sliceElements}
            </svg>

            {/* Dynamic Center Metric */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              {activeHoverItem ? (
                <>
                  <span className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
                    {activeHoverItem.count}
                  </span>
                  <span className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                    {activeHoverItem.label}
                  </span>
                  <span
                    className="mt-0.5 inline-flex items-center rounded-full px-1.5 py-0.2 text-[10px] font-medium"
                    style={{
                      color: activeHoverItem.theme.color,
                      backgroundColor: `${activeHoverItem.theme.color}18`,
                    }}
                  >
                    {Math.round((activeHoverItem.count / total) * 100)}% of total
                  </span>
                </>
              ) : (
                <>
                  <span className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
                    {total}
                  </span>
                  <span className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                    Total Tasks
                  </span>
                  <span className="mt-1 inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                    {completionRate}% complete
                  </span>
                </>
              )}
            </div>
          </div>
          <span className="mt-1.5 text-[11px] text-slate-400">Hover arcs to inspect details</span>
        </div>

        {/* 4 Status Health Cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:col-span-7 lg:col-span-8">
          {slices.map(sl => {
            const pct = total > 0 ? Math.round((sl.count / total) * 100) : 0
            const isCardHovered = hovered === sl.key
            const IconComponent = sl.icon

            return (
              <button
                key={sl.key}
                type="button"
                onClick={() => scrollToTaskColumn(sl.key)}
                onMouseEnter={() => setHovered(sl.key)}
                onMouseLeave={() => setHovered(null)}
                className={`group relative flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all duration-150 ${sl.theme.border} ${sl.theme.bgLight} ${
                  isCardHovered ? 'ring-2 ring-blue-500/30 shadow-sm' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex size-7 shrink-0 items-center justify-center rounded-lg shadow-2xs"
                      style={{
                        backgroundColor: `${sl.theme.color}16`,
                        color: sl.theme.color,
                      }}
                    >
                      <IconComponent className="size-4" />
                    </span>
                    <div>
                      <span className="block text-xs font-semibold text-slate-800">
                        {sl.label}
                      </span>
                      <span className="block text-[11px] text-slate-400">
                        {sl.theme.subtext}
                      </span>
                    </div>
                  </div>
                  <Badge tone={sl.theme.badgeTone}>{pct}%</Badge>
                </div>

                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-xl font-bold tracking-tight text-slate-900 tabular-nums">
                    {sl.count}
                  </span>
                  <span className="text-[11px] font-medium text-slate-500 group-hover:text-slate-800 group-hover:underline">
                    View column →
                  </span>
                </div>

                {/* Progress bar inside each card */}
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-200/70">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: sl.theme.color,
                    }}
                  />
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Workflow Timeline Distribution Progress Bar */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span className="font-medium text-slate-700">Workflow distribution</span>
          <span className="tabular-nums">
            {doneCount} of {total} done ({completionRate}%)
          </span>
        </div>
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 p-0.5 ring-1 ring-slate-900/5">
          {slices.filter(s => s.count > 0).map(s => {
            const pct = (s.count / total) * 100
            return (
              <div
                key={s.key}
                title={`${s.label}: ${s.count} (${Math.round(pct)}%)`}
                className="h-full first:rounded-l-full last:rounded-r-full transition-all duration-200 hover:brightness-110"
                style={{
                  width: `${pct}%`,
                  backgroundColor: s.theme.color,
                  opacity: hovered && hovered !== s.key ? 0.35 : 1,
                }}
                onMouseEnter={() => setHovered(s.key)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => scrollToTaskColumn(s.key)}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

const CUSTOM_TYPES_KEY = 'luxerefy-custom-task-types'
function loadCustomTypes(): { key: string; label: string }[] {
  try { return JSON.parse(localStorage.getItem(CUSTOM_TYPES_KEY) ?? '[]') } catch { return [] }
}
function saveCustomTypes(types: { key: string; label: string }[]) {
  try { localStorage.setItem(CUSTOM_TYPES_KEY, JSON.stringify(types)) } catch {}
}
export { loadCustomTypes }

function TaskSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [types, setTypes] = useState(loadCustomTypes)
  const [newType, setNewType] = useState('')
  const add = () => {
    if (!newType.trim()) return
    const key = newType.trim().toLowerCase().replace(/\s+/g, '_')
    const next = [...types, { key, label: newType.trim() }]
    setTypes(next)
    saveCustomTypes(next)
    setNewType('')
  }
  const remove = (key: string) => {
    const next = types.filter(t => t.key !== key)
    setTypes(next)
    saveCustomTypes(next)
  }
  return (
    <Modal open={open} onClose={onClose} title="Task settings">
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-semibold text-slate-500 uppercase">Built-in types</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(TASK_KIND_LABEL).map(([k, l]) => <Badge key={k} tone={TASK_KIND_TONE[k as TaskKind]}>{l}</Badge>)}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-slate-500 uppercase">Custom types</p>
          {types.length ? (
            <ul className="space-y-1.5">
              {types.map(t => (
                <li key={t.key} className="flex items-center gap-2">
                  <Badge tone="slate">{t.label}</Badge>
                  <button type="button" onClick={() => remove(t.key)} className="text-slate-400 hover:text-red-600"><Trash2 className="size-3.5" /></button>
                </li>
              ))}
            </ul>
          ) : <p className="text-xs text-slate-400">None yet.</p>}
        </div>
        <Field label="Add custom type">
          <div className="flex gap-2">
            <input value={newType} onChange={e => setNewType(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())} className={inputCls} placeholder="e.g. Document pickup" />
            <Button variant="secondary" onClick={add}>Add</Button>
          </div>
        </Field>
      </div>
    </Modal>
  )
}

export function TasksPage() {
  const { data } = useTasks()
  const setStatus = useSetTaskStatus()
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Task | null | 'new'>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  if (!data) return <Loading />

  const needle = q.toLowerCase()
  const base = data.filter(t => t.status !== 'cancelled' && (!needle || [t.title, t.lead_name, t.property_title].some(v => v?.toLowerCase().includes(needle))))

  const counts: Record<string, number> = {}
  for (const col of COLUMNS) counts[col.key] = base.filter(col.match).length

  return (
    <>
      <PageHeader icon={CheckSquare}
        title="Tasks"
        subtitle="Follow-ups, documents and approvals, split by where they stand"
        actions={<>
          <SearchBox value={q} onChange={setQ} placeholder="Search tasks" label="Search tasks" className="w-full sm:w-64" />
          <Button variant="secondary" onClick={() => setSettingsOpen(true)}><Settings2 className="size-4 text-slate-500" /> Settings</Button>
          <Button onClick={() => setEditing('new')}><Plus className="size-4" /> New task</Button>
        </>}
      />

      <Card className="mb-5 p-5">
        <TaskOverview counts={counts} />
      </Card>

      <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map(({ key, label, icon, match }) => {
          const rows = base.filter(match)
          if (key === 'done') rows.reverse()
          return (
            <Card key={key} id={`task-col-${key}`} className="flex flex-col">
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
                <Empty icon={icon}>{key === 'overdue' ? 'Nothing overdue.' : key === 'done' ? 'Nothing finished yet.' : key === 'future' ? 'Nothing upcoming.' : 'Nothing pending.'}</Empty>
              )}
            </Card>
          )
        })}
      </div>

      {setStatus.error && <p role="alert" className="mt-4 text-sm font-medium text-red-600">{(setStatus.error as Error).message}</p>}
      <TaskModal open={!!editing} onClose={() => setEditing(null)} task={editing === 'new' ? null : editing} />
      <TaskSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
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
