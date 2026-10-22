import { useMutation, useQuery } from '@tanstack/react-query'
import { db, respond, write } from '../../lib/mock/db'
import { supabase } from '../../lib/supabase'
import { canSeeTicket } from '../../lib/rules'
import { useUser } from '../../lib/session'
import type { Profile, Ticket, TicketPriority, TicketStatus } from '../../lib/types'

const name = (id: string | null) => db.profiles.find(p => p.id === id)?.full_name ?? null

/** Escalation now runs server-side via pg_cron calling escalate_overdue_tickets(). */
export const visibleTickets = (user: Profile) => db.tickets.filter(t => canSeeTicket(user, t))

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

/** A ticket is raised, not assigned: it lands on the one desk that works them. sla_due_at/number default server-side. */
export function useCreateTicket() {
  const user = useUser()
  return useMutation({
    mutationFn: (f: { title: string; description: string; priority: TicketPriority; lead_id: string | null; property_id: string | null }) =>
      write(async () => {
        if (!f.title.trim()) throw new Error('Give the ticket a title')
        const owner = db.profiles.find(p => p.active && p.role === 'owner') ?? db.profiles.find(p => p.active) ?? null
        const { data, error } = await supabase.from('tickets')
          .insert({ ...f, status: 'pending', raised_by: user.id, assigned_to: owner?.id ?? null })
          .select().single()
        if (error) throw new Error(error.message)
        return data as Ticket
      }),
  })
}

export function useUpdateTicket() {
  const user = useUser()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status?: TicketStatus }) =>
      write(async () => {
        const t = db.tickets.find(t => t.id === id)
        if (!t || !canSeeTicket(user, t)) throw new Error('Ticket not found')
        if (!status || status === t.status) return
        const now = new Date().toISOString()
        const patch: Partial<Ticket> = { status, resolved_at: status === 'resolved' ? now : null }
        if (status === 'in_progress' && !t.in_progress_at) patch.in_progress_at = now
        const { error } = await supabase.from('tickets').update(patch).eq('id', id)
        if (error) throw new Error(error.message)
      }),
  })
}
