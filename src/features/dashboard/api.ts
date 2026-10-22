import { useQuery } from '@tanstack/react-query'
import { db, respond } from '../../lib/mock/db'
import { addedByMe, isWon } from '../../lib/rules'
import { useUser } from '../../lib/session'
import { CATEGORIES, SEGMENTS, type LeadCut } from '../../lib/labels'
import type { Lead, PropertyStatus } from '../../lib/types'
import { activityFeed, visibleLeads } from '../leads/api'
import { visibleTickets } from '../tickets/api'

/** "Active" stock is anything still sellable — sold and off-market are out of the count. */
const ACTIVE: PropertyStatus[] = ['available', 'reserved']

const DAY = 86400e3

/** Becomes the security-invoker dashboard_stats() RPC, so RLS scopes it per role for free. */
export function useDashboard() {
  const user = useUser()
  return useQuery({
    queryKey: ['dashboard', user.id],
    queryFn: () => {
      const now = Date.now()
      const leads = visibleLeads(user).sort((a, b) => b.created_at.localeCompare(a.created_at))
      const day0 = new Date(); day0.setHours(0, 0, 0, 0)

      const cut = (ls: Lead[]) => ({
        count: ls.length,
        thisWeek: ls.filter(l => now - Date.parse(l.created_at) < 7 * DAY).length,
        lastWeek: ls.filter(l => { const age = now - Date.parse(l.created_at); return age >= 7 * DAY && age < 14 * DAY }).length,
        daily: Array.from({ length: 30 }, (_, i) => {
          const start = day0.getTime() - (29 - i) * DAY
          return { day: new Date(start).toISOString(), count: ls.filter(l => { const d = Date.parse(l.created_at); return d >= start && d < start + DAY }).length }
        }),
      })

      // "Added by me" is derived from the timeline, not a column — see addedByMe in rules.ts.
      const mine = leads.filter(l => addedByMe(db, l.id, user.id))
      const cuts: Record<LeadCut, ReturnType<typeof cut>> = {
        '': cut(leads),
        '99acres': cut(leads.filter(l => l.source === '99acres')),
        social_media: cut(leads.filter(l => l.source === 'social_media')),
        mine: cut(mine),
      }

      // Active stock, split residential/commercial, then by locality, then by the five types.
      const active = db.properties.filter(p => ACTIVE.includes(p.status))
      const stock = SEGMENTS.map(segment => {
        const ps = active.filter(p => p.segment === segment)
        const localities = [...new Set(ps.map(p => p.locality))].sort((a, b) => a.localeCompare(b))
        return {
          segment,
          total: ps.length,
          value: ps.reduce((v, p) => v + p.price, 0),
          areas: localities.map(locality => {
            const here = ps.filter(p => p.locality === locality)
            return {
              locality,
              total: here.length,
              byCategory: CATEGORIES.map(category => ({ category, count: here.filter(p => p.category === category).length })).filter(c => c.count > 0),
            }
          }),
        }
      })

      const tickets = visibleTickets(user).filter(t => t.status !== 'resolved')
      const won = leads.filter(isWon).length

      return respond({
        cuts,
        stock,
        won,
        conversion: leads.length ? won / leads.length : 0,
        openTickets: tickets.length,
        breached: tickets.filter(t => Date.parse(t.sla_due_at) < now).length,
        feed: activityFeed(new Set(leads.map(l => l.id)), 10),
      })
    },
  })
}
