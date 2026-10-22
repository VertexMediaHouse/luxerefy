import { GOAL_METRIC_LABEL } from '../../lib/labels'
import { inr } from '../../lib/format'
import type { GoalRow } from './api'

export const goalValue = (metric: GoalRow['metric'], n: number) => (metric === 'revenue' ? inr(n) : n.toLocaleString('en-IN'))

/** One target as a bar. Green only once it is met — that is the whole point of the colour. */
export function GoalBar({ g }: { g: GoalRow }) {
  const pct = g.target > 0 ? Math.round((g.actual / g.target) * 100) : 0
  const hit = pct >= 100
  const left = Math.max(0, g.target - g.actual)
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
        <span className="min-w-0 truncate font-medium text-slate-700">{GOAL_METRIC_LABEL[g.metric]}</span>
        <span className="shrink-0 text-slate-500 tabular-nums">
          <b className={`font-semibold ${hit ? 'text-emerald-700' : 'text-slate-900'}`}>{goalValue(g.metric, g.actual)}</b> / {goalValue(g.metric, g.target)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200/70" role="progressbar" aria-valuenow={Math.min(100, pct)} aria-valuemin={0} aria-valuemax={100} aria-label={GOAL_METRIC_LABEL[g.metric]}>
        <div className={`h-full rounded-full transition-[width] ${hit ? 'bg-emerald-500' : 'bg-blue-600'}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <p className="mt-1 text-xs text-slate-400">
        {hit ? `Target met — ${pct}%` : `${pct}% there, ${goalValue(g.metric, left)} to go`}
      </p>
    </div>
  )
}
