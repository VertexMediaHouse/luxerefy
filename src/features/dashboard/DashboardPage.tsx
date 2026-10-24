import { useState, type ComponentType, type PointerEvent } from 'react'
import { Link } from 'react-router'
import { Activity, ArrowDownRight, ArrowUpRight, Building2, CalendarCheck, CalendarClock, CheckSquare, LifeBuoy, Target, TrendingUp, Users } from 'lucide-react'
import { Badge, Button, Card, CardHeader, Empty, HeaderLink, Loading, PageHeader, Segmented, inlineInputCls } from '../../components/ui'
import { useUser } from '../../lib/session'
import { CATEGORIES, CATEGORY_LABEL, GOAL_PERIOD_LABEL, LEAD_CUTS, SEGMENTS, SEGMENT_LABEL, TASK_KIND_LABEL, type LeadCut } from '../../lib/labels'
import { inr, shortDate } from '../../lib/format'
import type { PropertyCategory, PropertySegment } from '../../lib/types'
import { ActivityTimeline } from '../leads/ActivityTimeline'
import { useTasks, isOverdue } from '../tasks/api'
import { useGoals, periodLabel } from '../goals/api'
import { GoalBar } from '../goals/GoalParts'
import { useProperties } from '../properties/api'
import { PropertyCard } from '../properties/PropertiesPage'
import { useDashboard } from './api'

type Icon = ComponentType<{ className?: string }>
const SERIES = '#2563eb'
const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString('en-IN', { month: 'long' }))

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values)
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${28 - (v / max) * 24}`)
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="hidden h-9 w-28 sm:block" aria-hidden>
      <polygon points={`0,30 ${pts.join(' ')} 100,30`} fill={SERIES} opacity="0.08" />
      <polyline points={pts.join(' ')} fill="none" stroke={SERIES} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

/** `dark` turns a tile into the hero card — one per row, as in the reference layout. */
function Kpi({ to, label, value, icon: I, foot, chart, control, dark }: { to?: string; label: string; value: string | number; icon: Icon; foot: React.ReactNode; chart?: React.ReactNode; control?: React.ReactNode; dark?: boolean }) {
  const cls = `relative rounded-xl border p-4 transition sm:p-5 ${
    dark
      ? 'bg-ink border-slate-700 hover:border-slate-500'
      : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/80'
  } ${to ? 'group cursor-pointer' : ''}`

  return (
    <div className={cls}>
      {to && <Link to={to} className="absolute inset-0 z-0 rounded-xl" aria-label={label} />}
      <div className="relative z-10 pointer-events-none">
        <div className="flex items-center gap-2.5">
          <I className={`size-4 ${dark ? 'text-blue-400' : 'text-blue-600'}`} />
          <p className={`text-sm leading-tight ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{label}</p>
          {control && <span className="ml-auto pointer-events-auto" onClick={e => e.stopPropagation()}>{control}</span>}
        </div>
        <div className="mt-3 flex items-end justify-between gap-2">
          <p className={`text-2xl font-semibold tracking-tight sm:text-3xl ${dark ? 'text-white' : 'text-slate-900'}`}>{value}</p>
          {chart}
        </div>
        <div className={`mt-3 text-xs ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{foot}</div>
      </div>
    </div>
  )
}

function Delta({ now, prev, dark }: { now: number; prev: number; dark?: boolean }) {
  const diff = now - prev
  const up = diff >= 0
  const Arrow = up ? ArrowUpRight : ArrowDownRight
  const skin = dark
    ? (up ? 'text-emerald-400' : 'text-red-400')
    : (up ? 'text-emerald-600' : 'text-red-600')
  return (
    <span className={`mr-1.5 inline-flex items-center gap-0.5 text-xs font-semibold ${skin}`}>
      <Arrow className="size-3" />{up ? '+' : ''}{diff}
    </span>
  )
}

/** 30-day lead inflow: single series area, crosshair + tooltip on hover. */
function InflowChart({ data }: { data: { day: string; count: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(4, ...data.map(d => d.count))
  const top = Math.ceil(max / 2) * 2
  const W = 600, H = 200
  const x = (i: number) => (i / (data.length - 1)) * W
  const y = (v: number) => H - (v / top) * (H - 8)
  const line = data.map((d, i) => `${x(i)},${y(d.count)}`).join(' ')
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setHover(Math.max(0, Math.min(data.length - 1, Math.round(((e.clientX - r.left) / r.width) * (data.length - 1)))))
  }
  const h = hover != null ? data[hover] : null
  const total = data.reduce((s, d) => s + d.count, 0)

  return (
    <div>
      <div className="mb-4 flex items-baseline gap-2 px-5">
        <span className="text-2xl font-semibold tracking-tight text-slate-900">{total}</span>
        <span className="text-sm text-slate-500">new leads in the last 30 days</span>
      </div>
      <div className="flex gap-2 px-5">
        <div className="flex h-[200px] flex-col justify-between pb-0 text-right text-[11px] text-slate-400">
          {[top, top / 2, 0].map(v => <span key={v} className="-my-1.5 w-5">{v}</span>)}
        </div>
        <div className="relative flex-1">
          <div
            className="relative h-[200px] touch-none"
            onPointerMove={move}
            onPointerLeave={() => setHover(null)}
            role="img"
            aria-label={`Daily new leads over 30 days, ${total} in total, peak ${Math.max(...data.map(d => d.count))} in a day`}
          >
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
              {[0, 0.5, 1].map(f => <line key={f} x1="0" x2={W} y1={H - f * (H - 8)} y2={H - f * (H - 8)} stroke="#e0e7f0" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
              <polygon points={`0,${H} ${line} ${W},${H}`} fill={SERIES} opacity="0.08" />
              <polyline points={line} fill="none" stroke={SERIES} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              {hover != null && <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} stroke="#94a3b8" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
            </svg>
            {h && hover != null && <>
              <span className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue-600 shadow" style={{ left: `${(hover / (data.length - 1)) * 100}%`, top: `${(y(h.count) / H) * 100}%` }} />
              <div className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-pop" style={{ left: `clamp(48px, ${(hover / (data.length - 1)) * 100}%, calc(100% - 48px))` }}>
                <div className="text-white/60">{new Date(h.day).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                <div className="font-semibold">{h.count} new lead{h.count === 1 ? '' : 's'}</div>
              </div>
            </>}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-slate-400">
            <span>{shortDate(data[0].day)}</span><span>{shortDate(data[15].day)}</span><span>Today</span>
          </div>
        </div>
      </div>
    </div>
  )
}

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' }
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

export function DashboardPage() {
  const user = useUser()
  const { data: d } = useDashboard()
  const { data: tasks } = useTasks()
  const { data: goals } = useGoals()
  const { data: properties = [] } = useProperties()
  const today = new Date()
  const [cut, setCut] = useState<LeadCut>('')
  const [segment, setSegment] = useState<PropertySegment>('residential')
  const [selectedCategory, setSelectedCategory] = useState<PropertyCategory | 'all'>('all')
  const [selectedArea, setSelectedArea] = useState<string>('all')
  const [month, setMonth] = useState(today.getMonth())
  const [year, setYear] = useState(today.getFullYear())

  if (!d || !tasks || !goals) return <Loading />

  const lead = d.cuts[cut]
  const cutLabel = LEAD_CUTS.find(c => c.value === cut)!.label

  const activeProperties = properties.filter(
    p => p.segment === segment && (p.status === 'available' || p.status === 'reserved')
  )
  const areas = [...new Set(activeProperties.map(p => p.locality))].sort((a, b) => a.localeCompare(b))
  const displayedProperties = activeProperties
    .filter(p => selectedCategory === 'all' || p.category === selectedCategory)
    .filter(p => selectedArea === 'all' || !areas.includes(selectedArea) || p.locality === selectedArea)

  const live = tasks.filter(t => t.status !== 'cancelled')
  const years = [...new Set([today.getFullYear(), ...live.map(t => new Date(t.due_at).getFullYear())])].sort((a, b) => b - a)
  const inMonth = live
    .filter(t => { const dt = new Date(t.due_at); return dt.getMonth() === month && dt.getFullYear() === year })
    .sort((a, b) => a.due_at.localeCompare(b.due_at))
  // Today's work first — that's what "tasks for the day" means — then the rest of the month.
  const dayTasks = inMonth.filter(t => sameDay(new Date(t.due_at), today))
  const ordered = [...dayTasks, ...inMonth.filter(t => !sameDay(new Date(t.due_at), today))]
  const overdueCount = live.filter(isOverdue).length
  const monthly = goals.filter(g => g.period === 'monthly' && g.target > 0)
  const yearly = goals.filter(g => g.period === 'yearly' && g.target > 0)

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user.full_name.split(' ')[0]}`}
        subtitle={today.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <Kpi
          dark
          to="/leads"
          label="Total leads"
          value={lead.count}
          icon={Users}
          chart={<Sparkline values={lead.daily.slice(-14).map(x => x.count)} />}
          control={
            <select value={cut} onChange={e => setCut(e.target.value as LeadCut)} className="rounded-lg border-0 bg-white/10 px-2 py-1 text-xs font-medium text-white ring-1 ring-white/15 focus:ring-2 focus:ring-blue-400 focus:outline-none [&>option]:text-slate-900" aria-label="Filter leads">
              {LEAD_CUTS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          }
          foot={<><Delta dark now={lead.thisWeek} prev={lead.lastWeek} />{lead.thisWeek} this week vs {lead.lastWeek} last, {cutLabel.toLowerCase()}</>}
        />
        <Kpi
          to="/properties"
          label="Active properties"
          value={activeProperties.length}
          icon={Building2}
          control={
            <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
              <select
                value={segment}
                onChange={e => {
                  setSegment(e.target.value as PropertySegment)
                  setSelectedArea('all')
                  setSelectedCategory('all')
                }}
                className={`${inlineInputCls} py-1 text-xs`}
                aria-label="Filter stock by segment"
              >
                {SEGMENTS.map(s => <option key={s} value={s}>{SEGMENT_LABEL[s]}</option>)}
              </select>
            </div>
          }
          foot={<>
            {inr(activeProperties.reduce((sum, p) => sum + p.price, 0))} of {SEGMENT_LABEL[segment].toLowerCase()} stock across {areas.length} {areas.length === 1 ? 'area' : 'areas'}
          </>}
        />
        <Kpi
          to="/tasks"
          label="Tasks today"
          value={dayTasks.length}
          icon={CheckSquare}
          foot={overdueCount ? <Badge tone="red">{overdueCount} overdue</Badge> : <Badge tone="green">Nothing overdue</Badge>}
        />
        <Kpi
          to="/tickets"
          label="Open tickets"
          value={d.openTickets}
          icon={LifeBuoy}
          foot={d.openTickets > 0 ? <Badge tone="blue">{d.openTickets} open</Badge> : <Badge tone="green">All clear</Badge>}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2 flex flex-col">
          <CardHeader
            icon={Building2}
            title="Active properties by area"
            subtitle={`${displayedProperties.length} ${SEGMENT_LABEL[segment].toLowerCase()}, available or reserved`}
            action={<div className="flex flex-wrap items-center gap-2">
              <Segmented
                label="Segment"
                value={segment}
                onChange={s => {
                  setSegment(s)
                  setSelectedArea('all')
                  setSelectedCategory('all')
                }}
                items={SEGMENTS.map(s => ({ value: s, label: SEGMENT_LABEL[s] }))}
              />
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value as PropertyCategory | 'all')}
                className={`${inlineInputCls} py-1 text-xs`}
                aria-label="Filter properties by type"
              >
                <option value="all">All types</option>
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
              {areas.length > 0 && (
                <select
                  value={areas.includes(selectedArea) ? selectedArea : 'all'}
                  onChange={e => setSelectedArea(e.target.value)}
                  className={`${inlineInputCls} py-1 text-xs`}
                  aria-label="Filter properties by area"
                >
                  <option value="all">All areas ({activeProperties.length})</option>
                  {areas.map(a => (
                    <option key={a} value={a}>
                      {a} ({activeProperties.filter(p => p.locality === a).length})
                    </option>
                  ))}
                </select>
              )}
              <HeaderLink to="/properties">All properties</HeaderLink>
            </div>}
          />
          {displayedProperties.length ? (
            <div className="grid gap-4 p-5 sm:grid-cols-2 max-h-[620px] overflow-y-auto">
              {displayedProperties.map(p => (
                <PropertyCard key={p.id} p={p} />
              ))}
            </div>
          ) : (
            <Empty icon={Building2}>
              No active {SEGMENT_LABEL[segment].toLowerCase()} properties
              {selectedCategory !== 'all' ? ` of type ${CATEGORY_LABEL[selectedCategory].toLowerCase()}` : ''}
              {selectedArea !== 'all' ? ` in ${selectedArea}` : ''}.
            </Empty>
          )}
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            icon={CalendarClock}
            title="Tasks for the day"
            subtitle={`${dayTasks.length} today, ${inMonth.length} in ${MONTHS[month]}`}
            action={<HeaderLink to="/calendar">Calendar</HeaderLink>}
          />
          <div className="flex gap-2 border-b border-slate-100 px-4 py-2.5">
            <select value={month} onChange={e => setMonth(Number(e.target.value))} className={`${inlineInputCls} flex-1 py-1 text-xs`} aria-label="Month">
              {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
            <select value={year} onChange={e => setYear(Number(e.target.value))} className={`${inlineInputCls} py-1 text-xs`} aria-label="Year">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          {ordered.length ? (
            <ul className="max-h-152 divide-y divide-slate-100 overflow-y-auto">
              {ordered.map(t => {
                const due = new Date(t.due_at)
                const isToday = sameDay(due, today)
                return (
                  <li key={t.id}>
                    <Link to={t.lead_id ? `/leads/${t.lead_id}` : '/tasks'} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                      <span className={`flex w-11 shrink-0 flex-col items-center rounded-md py-1 ${isOverdue(t) ? 'bg-red-50 text-red-700' : isToday ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>
                        <span className="text-[10px] font-medium">{due.toLocaleDateString('en-IN', { month: 'short' })}</span>
                        <span className="text-base leading-5 font-semibold">{due.getDate()}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-sm font-medium ${t.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{t.title}</span>
                        <span className="flex items-center gap-1.5 text-xs text-slate-500">
                          {t.kind === 'site_visit' ? <CalendarCheck className="size-3.5 text-emerald-600" /> : <CalendarClock className="size-3.5 text-slate-400" />}
                          {due.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                          {t.lead_name && `, ${t.lead_name}`}
                        </span>
                      </span>
                      {isOverdue(t) ? <Badge tone="red">Overdue</Badge> : isToday ? <Badge tone="slate">Today</Badge> : <span className="text-[11px] text-slate-400">{TASK_KIND_LABEL[t.kind]}</span>}
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : <Empty icon={CalendarClock}>Nothing in {MONTHS[month]} {year}.</Empty>}
        </Card>
      </div>

      <Card className="mt-4 pb-4">
        <CardHeader icon={TrendingUp} title="Lead inflow" subtitle={`New enquiries per day, ${cutLabel.toLowerCase()}`} action={<HeaderLink to="/leads">All leads</HeaderLink>} />
        <div className="pt-5"><InflowChart data={lead.daily} /></div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card tone="tint" className="flex flex-col">
          <CardHeader icon={Target} title="Goals" subtitle={`Monthly and yearly, ${(d.conversion * 100).toFixed(1)}% conversion so far`} action={<HeaderLink to="/goals">Manage</HeaderLink>} />
          {monthly.length || yearly.length ? (
            <div className="space-y-5 p-5">
              {[{ list: monthly, period: 'monthly' as const }, { list: yearly, period: 'yearly' as const }].filter(s => s.list.length).map(s => (
                <section key={s.period}>
                  <p className="mb-2.5 text-xs font-semibold tracking-wide text-slate-400 uppercase">{GOAL_PERIOD_LABEL[s.period]} · {periodLabel(s.period)}</p>
                  <div className="space-y-4">{s.list.map(g => <GoalBar key={g.id} g={g} />)}</div>
                </section>
              ))}
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
              <p className="text-sm text-slate-500">No targets set yet.</p>
              <Link to="/goals"><Button variant="secondary">Set your goals</Button></Link>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader icon={Activity} title="Recent activity" subtitle="Calls, notes and stage changes" action={<HeaderLink to="/leads">Leads</HeaderLink>} />
          <div className="p-5"><ActivityTimeline items={d.feed} showLead /></div>
        </Card>
      </div>
    </>
  )
}
