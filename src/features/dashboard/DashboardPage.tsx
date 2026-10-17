import { useState, type ComponentType, type PointerEvent } from 'react'
import { Link } from 'react-router'
import { Activity, ArrowDownRight, ArrowUpRight, CalendarCheck, CalendarClock, KanbanSquare, LifeBuoy, PieChart, Sparkles, Target, TrendingUp, Users } from 'lucide-react'
import { Badge, Card, CardHeader, Empty, HeaderLink, Loading, PageHeader } from '../../components/ui'
import { useUser } from '../../lib/session'
import { isManager } from '../../lib/rules'
import { ROLE_LABEL, SOURCE_LABEL } from '../../lib/labels'
import { inr, shortDate } from '../../lib/format'
import { ActivityTimeline } from '../leads/ActivityTimeline'
import { LeadBoard } from '../leads/LeadBoard'
import { useLeads } from '../leads/api'
import { useDashboard } from './api'

type Icon = ComponentType<{ className?: string }>
const SERIES = '#6e47e6'

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values)
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${28 - (v / max) * 24}`)
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="hidden h-9 w-28 sm:block" aria-hidden>
      <polygon points={`0,30 ${pts.join(' ')} 100,30`} fill={SERIES} opacity="0.1" />
      <polyline points={pts.join(' ')} fill="none" stroke={SERIES} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function Kpi({ to, label, value, icon: I, tint, foot, chart }: { to: string; label: string; value: string | number; icon: Icon; tint: string; foot: React.ReactNode; chart?: React.ReactNode }) {
  return (
    <Link to={to} className="group rounded-2xl bg-white p-4 shadow-card ring-1 ring-slate-200/70 transition hover:shadow-lift sm:p-5">
      <div className="flex items-center gap-2.5">
        <I className={`size-4 ${tint}`} />
        <p className="text-sm leading-tight text-slate-500">{label}</p>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <p className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{value}</p>
        {chart}
      </div>
      <div className="mt-3 text-xs text-slate-500">{foot}</div>
    </Link>
  )
}

function Delta({ now, prev }: { now: number; prev: number }) {
  const diff = now - prev
  const up = diff >= 0
  const Arrow = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={`mr-1.5 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold ${up ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
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
      <div className="flex gap-2 pr-5 pl-3">
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
              {[0, 0.5, 1].map(f => <line key={f} x1="0" x2={W} y1={H - f * (H - 8)} y2={H - f * (H - 8)} stroke="#e2e8f0" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
              <polygon points={`0,${H} ${line} ${W},${H}`} fill={SERIES} opacity="0.1" />
              <polyline points={line} fill="none" stroke={SERIES} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              {hover != null && <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} stroke="#94a3b8" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
            </svg>
            {h && hover != null && <>
              <span className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#6e47e6] shadow" style={{ left: `${(hover / (data.length - 1)) * 100}%`, top: `${(y(h.count) / H) * 100}%` }} />
              <div className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-pop" style={{ left: `clamp(48px, ${(hover / (data.length - 1)) * 100}%, calc(100% - 48px))` }}>
                <div className="text-blue-100/70">{new Date(h.day).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
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

export function DashboardPage() {
  const user = useUser()
  const { data: d } = useDashboard()
  const { data: leads } = useLeads()
  if (!d || !leads) return <Loading />
  const maxSource = Math.max(1, ...d.sources.map(s => s.count))
  const openValue = d.pipeline.filter(c => c.open).reduce((v, c) => v + c.value, 0)

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user.full_name.split(' ')[0]}`}
        subtitle={<>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}. {isManager(user) ? `${ROLE_LABEL[user.role]} view of the whole team.` : 'Your leads, follow-ups and tickets.'}</>}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi to="/leads" label="Total leads" value={d.total} icon={Users} tint="text-sky-500"
          chart={<Sparkline values={d.daily.slice(-14).map(x => x.count)} />}
          foot={<><Delta now={d.thisWeek} prev={d.lastWeek} />{d.thisWeek} this week vs {d.lastWeek} last week</>} />
        <Kpi to="/leads?status=new" label="Awaiting first call" value={d.fresh} icon={Sparkles} tint="text-violet-500"
          foot={<>New leads nobody has contacted yet</>} />
        <Kpi to="/tasks" label="Follow-ups due" value={d.followUps} icon={CalendarClock} tint="text-amber-500"
          foot={d.overdue ? <Badge tone="red">{d.overdue} overdue</Badge> : <Badge tone="green">All on track</Badge>} />
        <Kpi to="/tickets" label="Open tickets" value={d.openTickets} icon={LifeBuoy} tint="text-rose-500"
          foot={d.breached ? <Badge tone="red">{d.breached} past SLA</Badge> : <Badge tone="green">Within SLA</Badge>} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="pb-4 xl:col-span-2">
          <CardHeader icon={TrendingUp} title="Lead inflow" subtitle="New enquiries per day, all sources" action={<HeaderLink to="/leads">All leads</HeaderLink>} />
          <div className="pt-5"><InflowChart data={d.daily} /></div>
        </Card>

        <Card>
          <CardHeader icon={PieChart} title="Lead sources" subtitle={`Conversion ${(d.conversion * 100).toFixed(1)}%, ${d.won} won`} />
          {d.sources.length ? (
            <ul className="space-y-4 p-5">
              {d.sources.map(s => (
                <li key={s.source} title={`${SOURCE_LABEL[s.source]}: ${s.count} leads`}>
                  <div className="mb-1.5 flex items-baseline justify-between text-sm">
                    <span className="font-medium text-slate-700">{SOURCE_LABEL[s.source]}</span>
                    <span className="text-slate-500"><b className="font-semibold text-slate-900">{s.count}</b> <span className="inline-block w-10 text-right">{Math.round((s.count / d.total) * 100)}%</span></span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-[#6e47e6]" style={{ width: `${(s.count / maxSource) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          ) : <Empty icon={Target}>No leads yet.</Empty>}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader icon={KanbanSquare} title="Sales pipeline" subtitle={`${inr(openValue)} in open budgets`} action={<HeaderLink to="/pipeline">Open pipeline</HeaderLink>} />
        <div className="p-3"><LeadBoard leads={leads} limit={3} /></div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader icon={CalendarCheck} title="Agenda" subtitle="Follow-ups and site visits, soonest first" action={<HeaderLink to="/calendar">Calendar</HeaderLink>} />
          {d.upcoming.length ? (
            <ul className="divide-y divide-slate-100">
              {d.upcoming.map(t => {
                const due = new Date(t.due_at)
                const overdue = due.getTime() < Date.now()
                return (
                  <li key={t.id}>
                    <Link to={t.lead_id ? `/leads/${t.lead_id}` : '/tasks'} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50">
                      <span className={`flex w-12 shrink-0 flex-col items-center rounded-lg py-1 ring-1 ${overdue ? 'bg-rose-50 text-rose-700 ring-rose-600/15' : 'bg-slate-50 text-slate-700 ring-slate-900/[0.06]'}`}>
                        <span className="text-[10px] font-medium">{due.toLocaleDateString('en-IN', { month: 'short' })}</span>
                        <span className="text-base leading-5 font-semibold">{due.getDate()}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-900">{t.title}</span>
                        <span className="flex items-center gap-1.5 text-xs text-slate-500">
                          {t.kind === 'site_visit' ? <CalendarCheck className="size-3.5 text-emerald-600" /> : <CalendarClock className="size-3.5 text-blue-600" />}
                          {due.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}{t.lead && `, ${t.lead}`}
                        </span>
                      </span>
                      {overdue && <Badge tone="red">Overdue</Badge>}
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : <Empty icon={CalendarCheck}>Nothing scheduled. Add a follow-up from any lead.</Empty>}
        </Card>

        <Card>
          <CardHeader icon={Activity} title="Recent activity" subtitle="Calls, notes and stage changes across your leads" />
          <div className="p-5"><ActivityTimeline items={d.feed} showLead /></div>
        </Card>
      </div>
    </>
  )
}
