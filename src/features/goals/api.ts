import { useMutation, useQuery } from '@tanstack/react-query'
import { db, respond, write } from '../../lib/mock/db'
import { supabase } from '../../lib/supabase'
import { goalProgress, periodRange } from '../../lib/rules'
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
      write(async () => {
        if (!Number.isFinite(target) || target < 0) throw new Error('Enter a target of zero or more')
        const existing = db.goals.find(g => g.period === period && g.metric === metric)
        if (target === 0) {
          if (existing) await supabase.from('goals').delete().eq('id', existing.id)
          return null
        }
        if (existing) {
          const { data, error } = await supabase.from('goals').update({ target }).eq('id', existing.id).select().single()
          if (error) throw new Error(error.message)
          return data
        }
        const { data, error } = await supabase.from('goals').insert({ period, metric, target }).select().single()
        if (error) throw new Error(error.message)
        return data
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
