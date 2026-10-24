import { useState } from 'react'
import { Link } from 'react-router'
import {
  Award,
  Calendar,
  CheckCircle2,
  Clock,
  Compass,
  Flame,
  IndianRupee,
  Layers,
  Pencil,
  Sparkles,
  Target,
  Trophy,
} from 'lucide-react'
import { Button, Card, CardHeader, ErrorText, HeaderLink, Loading, PageHeader, inputCls } from '../../components/ui'
import { GOAL_METRICS, GOAL_PERIODS, GOAL_PERIOD_LABEL } from '../../lib/labels'
import { inr } from '../../lib/format'
import type { GoalMetric, GoalPeriod } from '../../lib/types'
import { periodLabel, useGoals, usePeriodBreakdown, useSaveGoal, type GoalRow } from './api'
import { goalValue } from './GoalParts'

/** Revenue is typed in Crores; other metrics are plain integer counts. */
const toInput = (metric: GoalMetric, target: number) =>
  metric === 'revenue' ? (target > 0 ? String(+(target / 1e7).toFixed(2)) : '') : (target > 0 ? String(target) : '')

const fromInput = (metric: GoalMetric, raw: string) => {
  const num = Number(raw)
  if (!Number.isFinite(num) || num <= 0) return 0
  return metric === 'revenue' ? Math.round(num * 1e7) : Math.round(num)
}

const METRIC_CONFIG: Record<
  GoalMetric,
  {
    icon: typeof Target
    label: string
    color: string
    gradient: string
    accentBg: string
    unit: string
    tip: string
    quickAdd: number[]
  }
> = {
  revenue: {
    icon: IndianRupee,
    label: 'Revenue Booked',
    color: 'text-emerald-500',
    gradient: 'from-emerald-500 to-teal-400',
    accentBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    unit: 'Cr',
    tip: 'Total closed deal value in won stage.',
    quickAdd: [1, 2, 5],
  },
  won: {
    icon: Trophy,
    label: 'Deals Won',
    color: 'text-amber-500',
    gradient: 'from-amber-500 to-orange-400',
    accentBg: 'bg-amber-50 text-amber-700 border-amber-200',
    unit: 'deals',
    tip: 'Total properties officially booked or sold.',
    quickAdd: [1, 2, 5],
  },
  site_visits: {
    icon: Compass,
    label: 'Site Visits Done',
    color: 'text-blue-500',
    gradient: 'from-blue-500 to-indigo-400',
    accentBg: 'bg-blue-50 text-blue-700 border-blue-200',
    unit: 'visits',
    tip: 'Field client inspections successfully conducted.',
    quickAdd: [2, 5, 10],
  },
  leads: {
    icon: Flame,
    label: 'New Leads',
    color: 'text-indigo-500',
    gradient: 'from-indigo-500 to-purple-400',
    accentBg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    unit: 'leads',
    tip: 'Total client inquiries captured in pipeline.',
    quickAdd: [5, 10, 20],
  },
}

export function GoalsPage() {
  const { data: goals } = useGoals()
  const save = useSaveGoal()
  const [period, setPeriod] = useState<GoalPeriod>('monthly')
  const [activeTab, setActiveTab] = useState<'focused' | 'matrix'>('focused')
  const { data: breakdown } = usePeriodBreakdown(period)

  if (!goals) return <Loading />

  const forPeriod = goals.filter(g => g.period === period)
  const setGoalsCount = goals.filter(g => g.target > 0).length

  // Calculate high-level performance stats for hero banner
  const revenueGoal = forPeriod.find(g => g.metric === 'revenue')
  const revenueActual = revenueGoal?.actual ?? 0
  const revenueTarget = revenueGoal?.target ?? 0
  const revenuePct = revenueTarget > 0 ? Math.round((revenueActual / revenueTarget) * 100) : 0

  const wonGoal = forPeriod.find(g => g.metric === 'won')
  const wonActual = wonGoal?.actual ?? 0
  const wonTarget = wonGoal?.target ?? 0

  const activeTargets = forPeriod.filter(g => g.target > 0)
  const metCount = activeTargets.filter(g => g.actual >= g.target).length
  const avgPct =
    activeTargets.length > 0
      ? Math.round(
          activeTargets.reduce((sum, g) => sum + Math.min(100, (g.actual / g.target) * 100), 0) /
            activeTargets.length
        )
      : 0

  const daysRemaining = breakdown?.daysRemaining ?? 7
  const elapsedPercent = breakdown?.elapsedPercent ?? 75

  // Motivational headline determination
  let headline = 'Set your targets and start building deal momentum.'
  let motivationTone = 'text-slate-300'
  if (revenuePct >= 100 || (activeTargets.length > 0 && metCount === activeTargets.length)) {
    headline = '🏆 Quota Crushed! Outstanding performance — setting new records!'
    motivationTone = 'text-emerald-400'
  } else if (revenuePct >= 75 || avgPct >= 75) {
    headline = '🔥 On Fire! Exceptional closing momentum — victory is within reach.'
    motivationTone = 'text-amber-300'
  } else if (revenuePct >= 40 || avgPct >= 40) {
    headline = '⚡ Solid Trajectory! Push high-priority leads to cross the finish line.'
    motivationTone = 'text-blue-300'
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Target}
        title="Goals & Milestones"
        subtitle="Set clear targets, track closing momentum, and celebrate your wins."
        tag={
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
            {setGoalsCount} active targets
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-xs">
              <button
                type="button"
                onClick={() => setActiveTab('focused')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition ${
                  activeTab === 'focused'
                    ? 'bg-ink text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Target className="size-3.5" />
                Target Board
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('matrix')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition ${
                  activeTab === 'matrix'
                    ? 'bg-ink text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="size-3.5" />
                All Periods Matrix
              </button>
            </div>
          </div>
        }
      />

      {/* Motivational Performance Pulse Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 text-white shadow-xl">
        {/* Ambient glow decoration */}
        <div className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-blue-600/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 right-1/3 size-64 rounded-full bg-emerald-500/10 blur-3xl" />

        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-white backdrop-blur-md">
                <Calendar className="size-3.5 text-blue-400" />
                {periodLabel(period)}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2.5 py-0.5 text-xs font-medium text-amber-300">
                <Clock className="size-3 text-amber-300" />
                {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} remaining
              </span>
              {activeTargets.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                  <CheckCircle2 className="size-3 text-emerald-300" />
                  {metCount} of {activeTargets.length} targets met
                </span>
              )}
            </div>

            <h2 className={`text-xl font-bold tracking-tight sm:text-2xl ${motivationTone}`}>
              {headline}
            </h2>

            <p className="text-sm text-slate-300 leading-relaxed">
              {revenueTarget > 0 ? (
                <>
                  You have booked <span className="font-semibold text-white">{inr(revenueActual)}</span> of your{' '}
                  <span className="font-semibold text-white">{inr(revenueTarget)}</span> {period} goal.
                  {wonActual > 0 && (
                    <> Powered by <span className="font-semibold text-white">{wonActual}{wonTarget > 0 ? ` / ${wonTarget}` : ''} won {wonActual === 1 ? 'deal' : 'deals'}</span>.</>
                  )}
                </>
              ) : (
                'Set your revenue and closing targets below to unlock real-time pace tracking and motivation.'
              )}
            </p>

            {/* Pacing progress bar */}
            <div className="pt-2">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                <span>Time elapsed: {elapsedPercent}% of {GOAL_PERIOD_LABEL[period].toLowerCase()}</span>
                <span className="font-medium text-slate-200">
                  {revenueTarget > 0 ? `Target progress: ${revenuePct}%` : 'Pacing ready'}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-400 to-emerald-400 transition-all duration-700"
                  style={{ width: `${Math.min(100, revenueTarget > 0 ? revenuePct : elapsedPercent)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Quick Hero Gauge / Ring */}
          <div className="flex shrink-0 items-center gap-5 border-t border-white/10 pt-4 lg:border-t-0 lg:border-l lg:border-white/10 lg:pl-8 lg:pt-0">
            <div className="relative flex size-28 items-center justify-center">
              <svg className="size-full -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="transparent"
                  stroke="rgba(255, 255, 255, 0.12)"
                  strokeWidth="8"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="transparent"
                  stroke="url(#hero-gradient)"
                  strokeWidth="8"
                  strokeDasharray={2 * Math.PI * 40}
                  strokeDashoffset={2 * Math.PI * 40 * (1 - Math.min(1, (revenueTarget > 0 ? revenuePct : avgPct) / 100))}
                  strokeLinecap="round"
                  className="transition-all duration-1000 ease-out"
                />
                <defs>
                  <linearGradient id="hero-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#38bdf8" />
                    <stop offset="100%" stopColor="#34d399" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute flex flex-col items-center text-center">
                <span className="text-2xl font-extrabold text-white">
                  {revenueTarget > 0 ? `${revenuePct}%` : `${avgPct}%`}
                </span>
                <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                  {revenueTarget > 0 ? 'Revenue' : 'Quota'}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="rounded-lg bg-white/5 p-2.5 px-3 border border-white/10 backdrop-blur-xs">
                <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Wins Booked</div>
                <div className="text-lg font-bold text-emerald-400">{wonActual} {wonActual === 1 ? 'deal' : 'deals'}</div>
              </div>
              <div className="rounded-lg bg-white/5 p-2.5 px-3 border border-white/10 backdrop-blur-xs">
                <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Field Visits</div>
                <div className="text-lg font-bold text-blue-400">{breakdown?.completedVisits.length ?? 0} done</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {activeTab === 'focused' ? (
        <>
          {/* Period Selection Navigation Strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-1.5">
              {GOAL_PERIODS.map(p => {
                const isSelected = period === p
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriod(p)}
                    className={`relative rounded-lg px-4 py-2 text-xs font-semibold transition ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    {GOAL_PERIOD_LABEL[p]}
                    {p === 'monthly' && (
                      <span className={`ml-1.5 rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-700'
                      }`}>
                        Primary
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Sparkles className="size-3.5 text-amber-500" />
              <span>Targets update automatically when deals close or tasks complete.</span>
            </div>
          </div>

          {/* The 4 Core Pillar Cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {GOAL_METRICS.map(metric => {
              const goal = forPeriod.find(g => g.metric === metric)
              return (
                <PillarCard
                  key={metric}
                  metric={metric}
                  period={period}
                  goal={goal}
                  daysRemaining={daysRemaining}
                  onSave={target => save.mutate({ period, metric, target })}
                  pending={save.isPending}
                />
              )
            })}
          </div>

          {/* Contextual Real Deal & Activity Evidence */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Won Leads Contributing to This Goal */}
            <Card>
              <CardHeader
                icon={Trophy}
                title={`Closed Wins in ${GOAL_PERIOD_LABEL[period]}`}
                subtitle={`${breakdown?.wonLeads.length ?? 0} deals credited to this period`}
                action={<HeaderLink to="/leads">View all leads</HeaderLink>}
              />
              {breakdown?.wonLeads.length ? (
                <div className="divide-y divide-slate-100 p-2">
                  {breakdown.wonLeads.map(lead => (
                    <Link
                      key={lead.id}
                      to={`/leads/${lead.id}`}
                      className="group flex items-center justify-between gap-3 rounded-lg p-3 transition hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-slate-900 group-hover:text-blue-600">
                            {lead.name}
                          </span>
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                            Closed Won
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-xs text-slate-500">
                          {lead.propertyTitle}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-emerald-600">{inr(lead.revenue)}</div>
                        <div className="text-[11px] text-slate-400">Credited to quota</div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="px-6 py-10 text-center">
                  <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                    <Trophy className="size-6" />
                  </div>
                  <h4 className="text-sm font-semibold text-slate-900">No closed deals this {period.replace('ly', '')} yet</h4>
                  <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                    When you move a lead to "Won", its booking value automatically credits to your revenue goal and deal count.
                  </p>
                  <Link to="/leads" className="mt-4 inline-block">
                    <Button variant="secondary" className="text-xs">
                      Check active pipeline
                    </Button>
                  </Link>
                </div>
              )}
            </Card>

            {/* Field Momentum: Completed Site Visits */}
            <Card>
              <CardHeader
                icon={Compass}
                title={`Site Visits in ${GOAL_PERIOD_LABEL[period]}`}
                subtitle={`${breakdown?.completedVisits.length ?? 0} visits completed`}
                action={<HeaderLink to="/calendar">Calendar</HeaderLink>}
              />
              {breakdown?.completedVisits.length ? (
                <div className="divide-y divide-slate-100 p-2">
                  {breakdown.completedVisits.map(visit => (
                    <div key={visit.id} className="flex items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-slate-900">
                            {visit.title}
                          </span>
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 border border-blue-200">
                            Completed
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-xs text-slate-500">
                          {visit.clientName ? `Client: ${visit.clientName}` : 'Field inspection'}
                          {visit.propertyTitle ? ` · ${visit.propertyTitle}` : ''}
                        </div>
                      </div>
                      <div className="text-right shrink-0 text-xs text-slate-400">
                        {new Date(visit.dueAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-6 py-10 text-center">
                  <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                    <Compass className="size-6" />
                  </div>
                  <h4 className="text-sm font-semibold text-slate-900">No completed site visits logged</h4>
                  <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                    Site visits are the strongest leading indicator of high-value closings. Schedule one from any lead card!
                  </p>
                  <Link to="/tasks" className="mt-4 inline-block">
                    <Button variant="secondary" className="text-xs">
                      Schedule a visit
                    </Button>
                  </Link>
                </div>
              )}
            </Card>
          </div>

          {/* Gamified Achievement Shelf */}
          <Card>
            <CardHeader
              icon={Award}
              title="Milestone Badges & Trophy Cabinet"
              subtitle="Earn badges as you hit quota records"
            />
            <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
              <BadgeTrophy
                title="Diamond Closer"
                desc="Hit ₹10 Cr+ in a single month"
                unlocked={revenueActual >= 10e7}
                progress={Math.min(100, Math.round((revenueActual / 10e7) * 100))}
                icon="💎"
              />
              <BadgeTrophy
                title="Hat-Trick Dealmaker"
                desc="Close 3+ deals in one month"
                unlocked={wonActual >= 3}
                progress={Math.min(100, Math.round((wonActual / 3) * 100))}
                icon="⚡"
              />
              <BadgeTrophy
                title="Field Champion"
                desc="Complete 5+ client site visits"
                unlocked={(breakdown?.completedVisits.length ?? 0) >= 5}
                progress={Math.min(100, Math.round(((breakdown?.completedVisits.length ?? 0) / 5) * 100))}
                icon="🏡"
              />
              <BadgeTrophy
                title="Pipeline Machine"
                desc="Capture 20+ inquiries in period"
                unlocked={(breakdown?.newLeadsCount ?? 0) >= 20}
                progress={Math.min(100, Math.round(((breakdown?.newLeadsCount ?? 0) / 20) * 100))}
                icon="🔥"
              />
            </div>
          </Card>
        </>
      ) : (
        /* All Periods Matrix View */
        <Card>
          <CardHeader
            icon={Layers}
            title="Strategic Target Matrix"
            subtitle="Side-by-side comparison across Weekly, Monthly, and Yearly horizons"
          />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3.5">Metric Pillar</th>
                  {GOAL_PERIODS.map(p => (
                    <th key={p} className="px-5 py-3.5 text-right">
                      {GOAL_PERIOD_LABEL[p]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {GOAL_METRICS.map(metric => {
                  const cfg = METRIC_CONFIG[metric]
                  const Icon = cfg.icon
                  return (
                    <tr key={metric} className="hover:bg-slate-50/70">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${cfg.accentBg}`}>
                            <Icon className="size-4" />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900">{cfg.label}</div>
                            <div className="text-xs text-slate-400">{cfg.tip}</div>
                          </div>
                        </div>
                      </td>
                      {GOAL_PERIODS.map(p => {
                        const g = goals.find(x => x.period === p && x.metric === metric)
                        const target = g?.target ?? 0
                        const actual = g?.actual ?? 0
                        const pct = target > 0 ? Math.round((actual / target) * 100) : 0
                        return (
                          <td key={p} className="px-5 py-4 text-right">
                            {target > 0 ? (
                              <div>
                                <div className="font-bold text-slate-900">
                                  {goalValue(metric, actual)}
                                  <span className="text-xs font-normal text-slate-400"> / {goalValue(metric, target)}</span>
                                </div>
                                <div className="mt-1 flex items-center justify-end gap-1.5">
                                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                                    <div
                                      className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-blue-600'}`}
                                      style={{ width: `${Math.min(100, pct)}%` }}
                                    />
                                  </div>
                                  <span className={`text-[11px] font-semibold ${pct >= 100 ? 'text-emerald-600' : 'text-slate-600'}`}>
                                    {pct}%
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setPeriod(p)
                                  setActiveTab('focused')
                                }}
                                className="text-xs text-blue-600 hover:underline font-medium"
                              >
                                + Set target
                              </button>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {save.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <ErrorText error={save.error} />
        </div>
      )}
    </div>
  )
}

function PillarCard({
  metric,
  period,
  goal,
  daysRemaining,
  onSave,
  pending,
}: {
  metric: GoalMetric
  period: GoalPeriod
  goal?: GoalRow
  daysRemaining: number
  onSave: (target: number) => void
  pending: boolean
}) {
  const cfg = METRIC_CONFIG[metric]
  const Icon = cfg.icon
  const currentTarget = goal?.target ?? 0
  const actual = goal?.actual ?? 0
  const pct = currentTarget > 0 ? Math.round((actual / currentTarget) * 100) : 0
  const isMet = pct >= 100
  const left = Math.max(0, currentTarget - actual)

  const [isEditing, setIsEditing] = useState(false)
  const [raw, setRaw] = useState(() => toInput(metric, currentTarget))

  const handleSave = (val: string) => {
    const next = fromInput(metric, val)
    onSave(next)
    setIsEditing(false)
  }

  const handleQuickAdd = (amount: number) => {
    const base = fromInput(metric, raw || '0')
    const increment = metric === 'revenue' ? amount * 1e7 : amount
    const nextVal = base + increment
    const nextStr = toInput(metric, nextVal)
    setRaw(nextStr)
  }

  // Pace insight text
  let paceText = ''
  if (currentTarget === 0) {
    paceText = `No target set yet. Click "Set Target" to get started.`
  } else if (isMet) {
    paceText = `🎉 Target crushed by ${pct - 100}%! Keep building momentum.`
  } else if (daysRemaining > 0) {
    if (metric === 'revenue') {
      const perDay = (left / 1e7 / daysRemaining).toFixed(2)
      paceText = `${goalValue(metric, left)} to go · ~₹${perDay} Cr/day pace needed`
    } else {
      paceText = `${left} ${cfg.unit} to go · ${daysRemaining} days remaining in period`
    }
  } else {
    paceText = `${goalValue(metric, left)} left to hit goal`
  }

  return (
    <Card className={`relative flex flex-col transition hover:shadow-md ${isMet ? 'ring-1 ring-emerald-400/50' : ''}`}>
      <div className="p-5 flex-1 flex flex-col justify-between">
        <div>
          {/* Header row: Icon, Title, Status badge */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg border ${cfg.accentBg}`}>
                <Icon className="size-4.5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{cfg.label}</h3>
                <span className="text-[11px] text-slate-400 capitalize">{period} goal</span>
              </div>
            </div>

            {currentTarget > 0 ? (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border ${
                  isMet
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : pct >= 70
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}
              >
                {isMet ? 'Crushed 🎉' : `${pct}%`}
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                Not set
              </span>
            )}
          </div>

          {/* Big number: Actual vs Target */}
          <div className="mt-4">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tracking-tight text-slate-900">
                {goalValue(metric, actual)}
              </span>
              {currentTarget > 0 ? (
                <span className="text-sm font-medium text-slate-400">
                  / {goalValue(metric, currentTarget)}
                </span>
              ) : null}
            </div>

            {/* Visual gradient progress bar */}
            <div className="mt-3">
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full transition-all duration-700 bg-gradient-to-r ${cfg.gradient}`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
            </div>

            {/* Motivational pace snippet */}
            <p className="mt-2 text-xs text-slate-500 leading-normal">{paceText}</p>
          </div>
        </div>

        {/* Footer: Quick Adjust / Set Target */}
        <div className="mt-4 pt-3 border-t border-slate-100">
          {!isEditing ? (
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setRaw(toInput(metric, currentTarget))
                  setIsEditing(true)
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition"
              >
                <Pencil className="size-3" />
                {currentTarget > 0 ? 'Adjust target' : 'Set target'}
              </button>

              {currentTarget > 0 && (
                <button
                  type="button"
                  onClick={() => onSave(0)}
                  disabled={pending}
                  className="text-[11px] text-slate-400 hover:text-red-500 transition"
                  title="Clear this target"
                >
                  Clear
                </button>
              )}
            </div>
          ) : (
            <form
              onSubmit={e => {
                e.preventDefault()
                handleSave(raw)
              }}
              className="space-y-2.5 pt-1"
            >
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <input
                    type="number"
                    min="0"
                    step={metric === 'revenue' ? '0.1' : '1'}
                    value={raw}
                    onChange={e => setRaw(e.target.value)}
                    placeholder={metric === 'revenue' ? 'e.g. 10' : 'e.g. 5'}
                    className={`${inputCls} w-full py-1 text-xs`}
                    autoFocus
                  />
                  {metric === 'revenue' && (
                    <span className="absolute right-2 top-1.5 text-xs font-medium text-slate-400 pointer-events-none">
                      Cr
                    </span>
                  )}
                </div>
                <Button type="submit" disabled={pending} className="px-2.5 py-1 text-xs">
                  Save
                </Button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="rounded-md p-1 text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              </div>

              {/* Quick increment chips */}
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-slate-400">Add:</span>
                {cfg.quickAdd.map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleQuickAdd(val)}
                    className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-200"
                  >
                    +{val} {cfg.unit}
                  </button>
                ))}
              </div>
            </form>
          )}
        </div>
      </div>
    </Card>
  )
}

function BadgeTrophy({
  title,
  desc,
  unlocked,
  progress,
  icon,
}: {
  title: string
  desc: string
  unlocked: boolean
  progress: number
  icon: string
}) {
  return (
    <div
      className={`relative flex items-center gap-3 rounded-xl border p-3.5 transition ${
        unlocked
          ? 'border-amber-200 bg-amber-50/40 shadow-xs'
          : 'border-slate-100 bg-slate-50/50 opacity-80'
      }`}
    >
      <div
        className={`flex size-11 shrink-0 items-center justify-center rounded-xl text-xl shadow-xs ${
          unlocked ? 'bg-amber-100 text-amber-700' : 'bg-slate-200/60 grayscale'
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xs font-bold text-slate-900">{title}</span>
          {unlocked && (
            <span className="rounded-full bg-amber-400 px-1.5 py-0.2 text-[9px] font-extrabold uppercase text-amber-950">
              Unlocked
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-slate-500 leading-snug">{desc}</p>
        {!unlocked && (
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-blue-500" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-[10px] font-semibold text-slate-500">{progress}%</span>
          </div>
        )}
      </div>
    </div>
  )
}
