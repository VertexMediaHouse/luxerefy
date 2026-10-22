import { useMutation, useQuery } from '@tanstack/react-query'
import { db, respond, write } from '../../lib/mock/db'
import { goalProgress, periodRange, uid } from '../../lib/rules'
import type { Goal, GoalMetric, GoalPeriod } from '../../lib/types'

export type GoalRow = Goal & { actual: number }

/** Every target with what has actually happened in the period in progress. */
export function useGoals() {
  return useQuery({
    queryKey: ['goals'],
    queryFn: () => respond(db.goals.map((g): GoalRow => ({ ...g, actual: goalProgress(db, g) }))),
  })
}

/**
 * One target per (period, metric), so saving is an upsert. A target of zero clears it —
 * that removes the need for a separate delete and an empty-state form.
 */
export function useSaveGoal() {
  return useMutation({
    mutationFn: ({ period, metric, target }: { period: GoalPeriod; metric: GoalMetric; target: number }) =>
      write(() => {
        if (!Number.isFinite(target) || target < 0) throw new Error('Enter a target of zero or more')
        const now = new Date().toISOString()
        const existing = db.goals.find(g => g.period === period && g.metric === metric)
        if (target === 0) {
          db.goals = db.goals.filter(g => g !== existing)
          return null
        }
        if (existing) {
          Object.assign(existing, { target, updated_at: now })
          return existing
        }
        const g: Goal = { id: uid(), period, metric, target, created_at: now, updated_at: now }
        db.goals.push(g)
        return g
      }),
  })
}

/** "1 – 31 Oct 2026" for the period on screen, so a number always has a window attached. */
export function periodLabel(period: GoalPeriod, now = new Date()) {
  const { start, end } = periodRange(period, now)
  const last = new Date(end.getTime() - 86400e3)
  if (period === 'yearly') return String(start.getFullYear())
  if (period === 'monthly') return start.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  return `${start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${last.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
}
