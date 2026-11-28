import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cron, db, ok, respond, write } from '../../lib/db'
import { supabase } from '../../lib/supabase'
import { canSeeTicket, soleOwner } from '../../lib/rules'
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
const TICKET_FORM = 'https://docs.google.com/forms/d/e/1FAIpQLSf7mJfoEweAUSoMozOUYD6dVQ-T5Nzqz8zaKyxfBQEtRNa9DQ/formResponse'

export function useCreateTicket() {
  const user = useUser()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (f: { title: string; description: string }) =>
      write(async () => {
        if (!f.title.trim()) throw new Error('Enter a subject')
        if (!f.description.trim()) throw new Error('Enter a body description')
        // An agent cannot see every ticket, so the number guessed here can collide; the
        // ticket_number trigger renumbers it server side when it does.
        return ok(await supabase.from('tickets').insert({
          number: Math.max(0, ...db.tickets.map(t => t.number)) + 1,
          title: f.title.trim(),
          description: f.description.trim(),
          status: 'pending',
          raised_by: user.id,
          assigned_to: soleOwner(db)?.id ?? null,
        }).select().single()) as Ticket
      }),
    onSuccess: async (t) => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      // Also file it on the Luxerefy Ticket Google Form. no-cors: Google sends no CORS headers,
      // so the response is opaque — fire-and-forget like the email below.
      fetch(TICKET_FORM, {
        method: 'POST',
        mode: 'no-cors',
        body: new URLSearchParams({
          'entry.619169916': `#TK-${String(t.number).padStart(3, '0')} ${t.title}`, // Subject
          'entry.120387872': t.description, // Body
        }),
      }).catch(() => {})
      // Fire-and-forget: a failed email must not undo or block the saved ticket.
      const { data } = await supabase.auth.getSession()
      fetch('/api/admin/ticket-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify({ id: t.id }),
      }).then(r => { if (!r.ok) r.json().then(b => console.error('Ticket email failed:', b.error)) }, e => console.error('Ticket email failed:', e))
    },
  })
}

export function useDeleteTicket() {
  const user = useUser()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      write(async () => {
        const t = db.tickets.find(t => t.id === id)
        if (!t || !canSeeTicket(user, t)) throw new Error('Ticket not found')
        // RLS denial deletes 0 rows without an error, so check what came back.
        if (!ok(await supabase.from('tickets').delete().eq('id', id).select('id'))?.length)
          throw new Error('You do not have permission to delete this ticket')
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
      write(async () => {
        const t = db.tickets.find(t => t.id === id)
        if (!t || !canSeeTicket(user, t)) throw new Error('Ticket not found')
        if (!status || status === t.status) return
        const now = new Date().toISOString()
        ok(await supabase.from('tickets').update({
          status,
          in_progress_at: status === 'in_progress' ? t.in_progress_at ?? now : t.in_progress_at,
          resolved_at: status === 'resolved' ? now : null,
        }).eq('id', id))
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
