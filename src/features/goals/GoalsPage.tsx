import { useState, type FormEvent } from 'react'
import { Target } from 'lucide-react'
import { Button, Card, CardHeader, ErrorText, Loading, PageHeader, Segmented, inputCls } from '../../components/ui'
import { GOAL_METRICS, GOAL_METRIC_LABEL, GOAL_PERIODS, GOAL_PERIOD_LABEL } from '../../lib/labels'
import type { GoalMetric, GoalPeriod } from '../../lib/types'
import { periodLabel, useGoals, useSaveGoal, type GoalRow } from './api'
import { GoalBar, goalValue } from './GoalParts'

/** Revenue is typed in crores; everything else is a plain count. */
const toInput = (metric: GoalMetric, target: number) => (metric === 'revenue' ? String(+(target / 1e7).toFixed(2)) : String(target))
const fromInput = (metric: GoalMetric, raw: string) => (metric === 'revenue' ? Math.round(Number(raw) * 1e7) : Math.round(Number(raw)))

export function GoalsPage() {
  const { data: goals } = useGoals()
  const save = useSaveGoal()
  const [period, setPeriod] = useState<GoalPeriod>('monthly')
  if (!goals) return <Loading />

  const forPeriod = goals.filter(g => g.period === period)
  const set = goals.filter(g => g.target > 0)

  return (
    <>
      <PageHeader
        icon={Target}
        title="Goals"
        subtitle="Set a target per period; progress is counted from your own leads, wins and visits."
        tag={<span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">{set.length} set</span>}
        actions={<Segmented label="Goal period" value={period} onChange={setPeriod} items={GOAL_PERIODS.map(p => ({ value: p, label: GOAL_PERIOD_LABEL[p] }))} />}
      />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader icon={Target} title={`${GOAL_PERIOD_LABEL[period]} progress`} subtitle={periodLabel(period)} />
          {forPeriod.filter(g => g.target > 0).length ? (
            <div className="space-y-5 p-5">
              {forPeriod.filter(g => g.target > 0).map(g => <GoalBar key={g.id} g={g} />)}
            </div>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-slate-500">
              No {GOAL_PERIOD_LABEL[period].toLowerCase()} target yet. Set one on the right.
            </p>
          )}
        </Card>

        <Card>
          <CardHeader title="Set targets" subtitle={`For every ${period === 'weekly' ? 'week' : period === 'monthly' ? 'month' : 'year'}. Zero clears a target.`} />
          <ul className="divide-y divide-slate-100">
            {GOAL_METRICS.map(metric => (
              <TargetRow key={metric} metric={metric} period={period} goal={forPeriod.find(g => g.metric === metric)} onSave={(target) => save.mutate({ period, metric, target })} pending={save.isPending} />
            ))}
          </ul>
          <div className="px-5 py-3"><ErrorText error={save.error} /></div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Everything you've set" subtitle="Across all three periods" />
        {set.length ? (
          <div className="grid gap-x-8 gap-y-5 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {GOAL_PERIODS.flatMap(p => set.filter(g => g.period === p)).map(g => (
              <div key={g.id}>
                <p className="mb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">{GOAL_PERIOD_LABEL[g.period]} · {periodLabel(g.period)}</p>
                <GoalBar g={g} />
              </div>
            ))}
          </div>
        ) : <p className="px-5 py-10 text-center text-sm text-slate-500">Nothing set yet.</p>}
      </Card>
    </>
  )
}

function TargetRow({ metric, period, goal, onSave, pending }: { metric: GoalMetric; period: GoalPeriod; goal?: GoalRow; onSave: (target: number) => void; pending: boolean }) {
  const current = goal?.target ?? 0
  const [raw, setRaw] = useState(() => toInput(metric, current))
  // Reset the field when the period tab changes under it.
  const [seen, setSeen] = useState(period)
  if (seen !== period) { setSeen(period); setRaw(toInput(metric, current)) }

  const next = fromInput(metric, raw || '0')
  const dirty = Number.isFinite(next) && next !== current
  const submit = (e: FormEvent) => { e.preventDefault(); onSave(next) }

  return (
    <li>
      <form onSubmit={submit} className="flex items-center gap-3 px-5 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900">{GOAL_METRIC_LABEL[metric]}</p>
          <p className="text-xs text-slate-400">{current > 0 ? `Now ${goalValue(metric, current)}` : 'Not set'}</p>
        </div>
        <label className="flex items-center gap-1.5">
          <span className="sr-only">{GOAL_METRIC_LABEL[metric]} target</span>
          <input
            value={raw}
            onChange={e => setRaw(e.target.value)}
            type="number"
            min="0"
            step={metric === 'revenue' ? '0.1' : '1'}
            className={`${inputCls} w-24 text-right`}
          />
          {metric === 'revenue' && <span className="text-xs text-slate-500">Cr</span>}
        </label>
        <Button type="submit" variant="secondary" disabled={!dirty || pending}>Save</Button>
      </form>
    </li>
  )
}
