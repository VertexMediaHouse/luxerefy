import { useState, type ChangeEvent } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { Button, Card, inlineInputCls, Loading, PageHeader } from '../../components/ui'
import { useProfiles, useUser } from '../../lib/session'
import { isManager } from '../../lib/rules'
import { initials } from '../../lib/format'
import type { Task, TaskKind } from '../../lib/types'
import { useLeads } from '../leads/api'
import { useProperties } from '../properties/api'
import { useTasks, type TaskRow } from '../tasks/api'
import { TaskModal } from '../tasks/TaskModal'

const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const startOfWeek = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7)) // Monday
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
const at11 = (d: Date) => { const x = new Date(d); x.setHours(11, 0, 0, 0); return x.toISOString() }

const CHIP: Record<TaskKind, string> = {
  follow_up: 'border-blue-500 bg-blue-50 text-blue-900',
  site_visit: 'border-emerald-500 bg-emerald-50 text-emerald-900',
  meeting: 'border-violet-500 bg-violet-50 text-violet-900',
  documents: 'border-amber-500 bg-amber-50 text-amber-900',
  approval: 'border-red-500 bg-red-50 text-red-900',
  other: 'border-slate-400 bg-slate-50 text-slate-800',
}

function Chip({ t, onClick, compact }: { t: TaskRow; onClick: () => void; compact?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`block w-full rounded-md border-l-[3px] px-2 py-1.5 text-left text-xs transition hover:brightness-95 ${CHIP[t.kind]} ${t.status === 'done' ? 'opacity-50' : ''}`}>
      <span className="font-semibold">{time(t.due_at)}{!compact && t.ends_at && ` – ${time(t.ends_at)}`}</span>{' '}
      <span className={compact ? 'hidden md:inline' : ''}>{t.title}</span>
      {!compact && <span className="mt-0.5 block text-[11px] opacity-70">{initials(t.assignee_name)}{t.lead_name && ` · ${t.lead_name}`}</span>}
    </button>
  )
}

export function CalendarPage() {
  const user = useUser()
  const { data } = useTasks()
  const { data: profiles } = useProfiles()
  const { data: properties = [] } = useProperties()
  const { data: leads = [] } = useLeads()
  const [view, setView] = useState<'week' | 'month'>('week')
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()))
  const [filter, setFilter] = useState({ agent: '', property: '', lead: '' })
  const [editing, setEditing] = useState<Task | null>(null)
  const [creatingOn, setCreatingOn] = useState<Date | null>(null)
  if (!data) return <Loading />

  const events = data.filter(t => t.status !== 'cancelled' && (!filter.agent || t.assigned_to === filter.agent) && (!filter.property || t.property_id === filter.property) && (!filter.lead || t.lead_id === filter.lead))
  const on = (d: Date) => events.filter(e => sameDay(new Date(e.due_at), d))
  const first = view === 'week' ? startOfWeek(anchor) : startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1))
  const days = Array.from({ length: view === 'week' ? 7 : 42 }, (_, i) => addDays(first, i))
  const today = new Date()
  const step = (n: number) => setAnchor(view === 'week' ? addDays(anchor, 7 * n) : new Date(anchor.getFullYear(), anchor.getMonth() + n, 1))
  const label = view === 'week'
    ? `${days[0].toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : anchor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  const set = (k: keyof typeof filter) => (e: ChangeEvent<HTMLSelectElement>) => setFilter(f => ({ ...f, [k]: e.target.value }))

  return (
    <>
      <PageHeader icon={CalendarDays} tint="text-rose-500" title="Calendar" subtitle="Site visits, follow-ups and meetings in one view" actions={<Button onClick={() => setCreatingOn(today)}><Plus className="size-4" /> New event</Button>} />

      <Card className="mb-4 flex flex-col gap-3 p-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" className="px-2" onClick={() => step(-1)} aria-label="Previous"><ChevronLeft className="size-4" /></Button>
          <Button variant="secondary" onClick={() => setAnchor(startOfDay(new Date()))}>Today</Button>
          <Button variant="secondary" className="px-2" onClick={() => step(1)} aria-label="Next"><ChevronRight className="size-4" /></Button>
          <h2 className="ml-2 text-base font-semibold text-slate-900">{label}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex gap-0.5 rounded-lg bg-slate-100 p-0.5" role="group" aria-label="Calendar view">
            {(['week', 'month'] as const).map(v => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${view === v ? 'bg-white text-slate-900 shadow-card ring-1 ring-slate-900/5' : 'text-slate-500 hover:text-slate-800'}`}>
                {v === 'week' ? 'Week' : 'Month'}
              </button>
            ))}
          </div>
          {isManager(user) && (
            <select value={filter.agent} onChange={set('agent')} className={`${inlineInputCls}`} aria-label="Filter by agent">
              <option value="">All agents</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          )}
          <select value={filter.property} onChange={set('property')} className={`${inlineInputCls} max-w-48`} aria-label="Filter by property">
            <option value="">All properties</option>
            {properties.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <select value={filter.lead} onChange={set('lead')} className={`${inlineInputCls} max-w-44`} aria-label="Filter by lead">
            <option value="">All leads</option>
            {leads.map(l => <option key={l.id} value={l.id}>{l.contact.name}</option>)}
          </select>
        </div>
      </Card>

      {view === 'week' ? (
        <Card className="grid divide-y divide-slate-100 overflow-hidden md:grid-cols-7 md:divide-x md:divide-y-0">
          {days.map(d => {
            const isToday = sameDay(d, today)
            return (
              <div key={d.toISOString()} className={`flex flex-col md:min-h-[26rem] ${isToday ? 'bg-blue-50/40' : ''}`}>
                <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
                  <span className="text-xs font-semibold text-slate-500">{d.toLocaleDateString('en-IN', { weekday: 'short' })}</span>
                  <span className={`flex size-6 items-center justify-center rounded-full text-sm font-semibold ${isToday ? 'bg-blue-600 text-white' : 'text-slate-800'}`}>{d.getDate()}</span>
                </div>
                <div className="flex-1 space-y-1.5 p-2">
                  {on(d).map(t => <Chip key={t.id} t={t} onClick={() => setEditing(t)} />)}
                </div>
                <button type="button" onClick={() => setCreatingOn(d)} className="border-t border-slate-100 py-1.5 text-xs font-semibold text-slate-400 hover:bg-slate-50 hover:text-blue-700" aria-label={`Add event on ${d.toDateString()}`}>Add</button>
              </div>
            )
          })}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/80 text-center text-xs font-medium text-slate-500">
            {days.slice(0, 7).map(d => <div key={d.getDay()} className="py-2">{d.toLocaleDateString('en-IN', { weekday: 'short' })}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map(d => {
              const items = on(d)
              const inMonth = d.getMonth() === anchor.getMonth()
              return (
                <div key={d.toISOString()} className={`min-h-20 border-r border-b border-slate-100 p-1 md:min-h-28 md:p-1.5 [&:nth-child(7n)]:border-r-0 ${inMonth ? '' : 'bg-slate-50/60'}`}>
                  <button type="button" onClick={() => { setAnchor(d); setView('week') }} className={`mb-1 flex size-6 items-center justify-center rounded-full text-xs font-bold ${sameDay(d, today) ? 'bg-blue-600 text-white' : inMonth ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-300'}`}>{d.getDate()}</button>
                  <div className="space-y-1">
                    {items.slice(0, 3).map(t => <Chip key={t.id} t={t} compact onClick={() => setEditing(t)} />)}
                    {items.length > 3 && <button type="button" onClick={() => { setAnchor(d); setView('week') }} className="px-1 text-[11px] font-bold text-blue-700">+{items.length - 3} more</button>}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      <TaskModal open={!!editing} onClose={() => setEditing(null)} task={editing} />
      <TaskModal open={!!creatingOn} onClose={() => setCreatingOn(null)} defaults={{ kind: 'site_visit', due_at: creatingOn ? at11(creatingOn) : undefined, assigned_to: filter.agent || undefined, property_id: filter.property || null, lead_id: filter.lead || null }} />
    </>
  )
}
