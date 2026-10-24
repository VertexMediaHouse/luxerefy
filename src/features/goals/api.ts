import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { db, respond, write } from '../../lib/mock/db'
import { goalProgress, isWon, periodRange, uid } from '../../lib/rules'
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
  const qc = useQueryClient()
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] })
    },
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

export function periodDaysRemaining(period: GoalPeriod, now = new Date()) {
  const { end } = periodRange(period, now)
  const diff = end.getTime() - now.getTime()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

export function periodTotalDays(period: GoalPeriod, now = new Date()) {
  const { start, end } = periodRange(period, now)
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))
}

export function periodElapsedPercent(period: GoalPeriod, now = new Date()) {
  const { start, end } = periodRange(period, now)
  const total = end.getTime() - start.getTime()
  const elapsed = Math.max(0, Math.min(total, now.getTime() - start.getTime()))
  return Math.min(100, Math.round((elapsed / total) * 100))
}

/** Pulls real CRM deals and tasks contributing to the goals in this period. */
export function usePeriodBreakdown(period: GoalPeriod, now = new Date()) {
  return useQuery({
    queryKey: ['period_breakdown', period],
    queryFn: () => {
      const { start, end } = periodRange(period, now)
      const within = (iso: string) => {
        const d = Date.parse(iso)
        return d >= start.getTime() && d < end.getTime()
      }

      const wonLeads = db.leads
        .filter(l => isWon(l) && within(l.updated_at))
        .map(l => {
          const contact = db.contacts.find(c => c.id === l.contact_id)
          const property = l.property_ids[0] ? db.properties.find(p => p.id === l.property_ids[0]) : null
          const revenue = l.budget_max ?? l.budget_min ?? 0
          return {
            id: l.id,
            name: contact?.name ?? 'Client',
            phone: contact?.phone ?? '',
            propertyTitle: property?.title ?? l.property_interest ?? 'Property',
            revenue,
            updatedAt: l.updated_at,
          }
        })

      const completedVisits = db.tasks
        .filter(k => k.kind === 'site_visit' && k.status === 'done' && within(k.due_at))
        .map(t => {
          const property = t.property_id ? db.properties.find(p => p.id === t.property_id) : null
          const lead = t.lead_id ? db.leads.find(l => l.id === t.lead_id) : null
          const contact = lead ? db.contacts.find(c => c.id === lead.contact_id) : null
          return {
            id: t.id,
            title: t.title,
            dueAt: t.due_at,
            clientName: contact?.name ?? null,
            propertyTitle: property?.title ?? null,
          }
        })

      const newLeads = db.leads.filter(l => within(l.created_at))

      return respond({
        wonLeads,
        completedVisits,
        newLeadsCount: newLeads.length,
        daysRemaining: periodDaysRemaining(period, now),
        totalDays: periodTotalDays(period, now),
        elapsedPercent: periodElapsedPercent(period, now),
      })
    },
  })
}
