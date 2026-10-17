import { useQuery } from '@tanstack/react-query'
import { db, respond } from '../../lib/mock/db'
import { isManager, isOpen, isWon } from '../../lib/rules'
import { useUser } from '../../lib/session'
import { defaultPipeline, stageKind, stagesOf } from '../../lib/stages'
import type { Lead, LeadSource } from '../../lib/types'
import { activityFeed, visibleLeads } from '../leads/api'
import { visibleTickets } from '../tickets/api'

/** Becomes the security-invoker dashboard_stats() RPC, so RLS scopes it per role for free. */
export function useDashboard() {
  const user = useUser()
  return useQuery({
    queryKey: ['dashboard', user.id],
    queryFn: () => {
      const now = Date.now()
      const leads = visibleLeads(user).sort((a, b) => b.created_at.localeCompare(a.created_at))
      const name = (leadId: string | null) => {
        const l = db.leads.find(l => l.id === leadId)
        return db.contacts.find(c => c.id === l?.contact_id)?.name ?? ''
      }
      const tasks = db.tasks
        .filter(t => t.status === 'pending' && (isManager(user) || t.assigned_to === user.id))
        .sort((a, b) => a.due_at.localeCompare(b.due_at))
      const tickets = visibleTickets(user).filter(t => t.status !== 'resolved')
      const won = leads.filter(isWon).length
      const bySource = new Map<LeadSource, number>()
      for (const l of leads) bySource.set(l.source, (bySource.get(l.source) ?? 0) + 1)
      const brief = (l: Lead) => ({ id: l.id, name: name(l.id), source: l.source, budget: l.budget_max ?? l.budget_min })
      const day0 = new Date(); day0.setHours(0, 0, 0, 0)
      const daily = Array.from({ length: 30 }, (_, i) => {
        const start = day0.getTime() - (29 - i) * 86400e3
        return { day: new Date(start).toISOString(), count: leads.filter(l => { const t = Date.parse(l.created_at); return t >= start && t < start + 86400e3 }).length }
      })

      return respond({
        total: leads.length,
        thisWeek: leads.filter(l => now - Date.parse(l.created_at) < 7 * 86400e3).length,
        lastWeek: leads.filter(l => { const age = now - Date.parse(l.created_at); return age >= 7 * 86400e3 && age < 14 * 86400e3 }).length,
        daily,
        fresh: leads.filter(l => stageKind(l.status) === 'entry').length,
        followUps: tasks.length,
        overdue: tasks.filter(t => Date.parse(t.due_at) < now).length,
        openTickets: tickets.length,
        breached: tickets.filter(t => Date.parse(t.sla_due_at) < now).length,
        won,
        conversion: leads.length ? won / leads.length : 0,
        pipeline: stagesOf(defaultPipeline().id).map(({ id: s }) => {
          const ls = leads.filter(l => l.status === s)
          return { status: s, open: isOpen({ status: s }), count: ls.length, value: ls.reduce((v, l) => v + (l.budget_max ?? l.budget_min ?? 0), 0), leads: ls.slice(0, 3).map(brief) }
        }),
        sources: [...bySource].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
        upcoming: tasks.slice(0, 6).map(t => ({ ...t, lead: name(t.lead_id) })),
        feed: activityFeed(new Set(leads.map(l => l.id)), 8),
      })
    },
  })
}
