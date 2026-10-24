import { useMutation, useQuery } from '@tanstack/react-query'
import { cron, db, respond, write } from '../../lib/mock/db'
import { canSeeTicket, slaDue, soleOwner, uid } from '../../lib/rules'
import { useUser } from '../../lib/session'
import type { Profile, Ticket, TicketPriority, TicketStatus } from '../../lib/types'

const name = (id: string | null) => db.profiles.find(p => p.id === id)?.full_name ?? null

export const visibleTickets = (user: Profile) => {
  cron()
  return db.tickets.filter(t => canSeeTicket(user, t))
}

export function useTickets() {
  const user = useUser()
  return useQuery({
    queryKey: ['tickets', user.id],
    queryFn: () =>
      respond(
        visibleTickets(user)
          .sort((a, b) => b.number - a.number)
          .map(t => ({
            ...t,
            raised_by_name: name(t.raised_by),
            assignee_name: name(t.assigned_to),
            lead_name: db.contacts.find(c => c.id === db.leads.find(l => l.id === t.lead_id)?.contact_id)?.name ?? null,
            property_title: db.properties.find(p => p.id === t.property_id)?.title ?? null,
          })),
      ),
  })
}
export type TicketRow = NonNullable<ReturnType<typeof useTickets>['data']>[number]

/** A ticket is raised, not assigned: it lands on the one desk that works them. */
export function useCreateTicket() {
  const user = useUser()
  return useMutation({
    mutationFn: (f: { title: string; description: string; priority: TicketPriority; lead_id: string | null; property_id: string | null }) =>
      write(() => {
        if (!f.title.trim()) throw new Error('Give the ticket a title')
        const created_at = new Date().toISOString()
        const t: Ticket = {
          ...f, id: uid(), number: Math.max(0, ...db.tickets.map(t => t.number)) + 1, status: 'pending', raised_by: user.id,
          assigned_to: soleOwner(db)?.id ?? null, sla_due_at: slaDue(created_at, f.priority),
          escalation_level: 0, escalated_at: null, in_progress_at: null, resolved_at: null, created_at,
        }
        db.tickets.push(t)
        return t
      }),
  })
}

export function useUpdateTicket() {
  const user = useUser()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status?: TicketStatus }) =>
      write(() => {
        const t = db.tickets.find(t => t.id === id)
        if (!t || !canSeeTicket(user, t)) throw new Error('Ticket not found')
        const now = new Date().toISOString()
        if (status && status !== t.status) {
          t.status = status
          if (status === 'in_progress') t.in_progress_at ??= now
          t.resolved_at = status === 'resolved' ? now : null
        }
      }),
  })
}
