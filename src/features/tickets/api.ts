import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cron, db, respond, write } from '../../lib/mock/db'
import { canSeeTicket, soleOwner, uid } from '../../lib/rules'
import { useUser } from '../../lib/session'
import type { Profile, Ticket, TicketStatus } from '../../lib/types'

const name = (id?: string | null) => (id ? db.profiles.find(p => p.id === id)?.full_name ?? null : null)

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
            assignee_name: name(t.assigned_to ?? null),
          })),
      ),
  })
}
export type TicketRow = NonNullable<ReturnType<typeof useTickets>['data']>[number]

/** A ticket is raised with subject (title) and body (description). */
export function useCreateTicket() {
  const user = useUser()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (f: { title: string; description: string }) =>
      write(() => {
        if (!f.title.trim()) throw new Error('Enter a subject')
        if (!f.description.trim()) throw new Error('Enter a body description')
        const created_at = new Date().toISOString()
        const t: Ticket = {
          id: uid(),
          number: Math.max(0, ...db.tickets.map(t => t.number)) + 1,
          title: f.title.trim(),
          description: f.description.trim(),
          status: 'pending',
          raised_by: user.id,
          assigned_to: soleOwner(db)?.id ?? null,
          in_progress_at: null,
          resolved_at: null,
          created_at,
        }
        db.tickets.push(t)
        return t
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useUpdateTicket() {
  const user = useUser()
  const qc = useQueryClient()
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

