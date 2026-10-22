import { useMutation, useQuery } from '@tanstack/react-query'
import { db, respond, write } from '../../lib/mock/db'
import { supabase } from '../../lib/supabase'
import { canSeeLead, isManager, normalizePhone } from '../../lib/rules'
import { useUser } from '../../lib/session'
import type { Contact, Profile } from '../../lib/types'
import { activityFeed } from '../leads/api'

export type ContactInput = Pick<Contact, 'name' | 'phone' | 'email' | 'kind'>

/** RLS already scopes `db.contacts`/`db.leads`; this filter is a harmless no-op on top. */
const canSeeContact = (user: Profile, c: Contact) =>
  isManager(user) || c.created_by === user.id || db.leads.some(l => l.contact_id === c.id && l.assigned_to === user.id)

const leadsOf = (user: Profile, contactId: string) => db.leads.filter(l => l.contact_id === contactId && canSeeLead(user, l))

export function useContacts() {
  const user = useUser()
  return useQuery({
    queryKey: ['contacts', user.id],
    queryFn: () =>
      respond(
        db.contacts
          .filter(c => canSeeContact(user, c))
          .map(c => {
            const leads = leadsOf(user, c.id)
            return { ...c, lead_count: leads.length, latest: leads.sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null }
          })
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),
  })
}

export function useContact(id: string) {
  const user = useUser()
  return useQuery({
    queryKey: ['contact', id, user.id],
    queryFn: () => {
      const c = db.contacts.find(c => c.id === id)
      if (!c || !canSeeContact(user, c)) return respond(null)
      const leads = leadsOf(user, id).sort((a, b) => b.created_at.localeCompare(a.created_at))
      return respond({
        ...c,
        leads: leads.map(l => ({
          ...l,
          property: db.properties.find(p => p.id === l.property_ids[0]) ?? null,
        })),
        feed: activityFeed(new Set(leads.map(l => l.id)), 30),
      })
    },
  })
}

export function useSaveContact() {
  const user = useUser()
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: ContactInput }) =>
      write(async () => {
        const phone = normalizePhone(input.phone)
        if (!phone) throw new Error('Enter a valid mobile number')
        if (!input.name.trim()) throw new Error('Name is required')
        const clash = db.contacts.find(c => c.phone === phone && c.id !== id)
        if (clash) throw new Error(`This number already belongs to ${canSeeContact(user, clash) ? clash.name : 'another contact'}.`)
        const patch = { name: input.name.trim(), phone, email: input.email?.trim() || null, kind: input.kind }
        const existing = db.contacts.find(c => c.id === id)
        if (id && (!existing || !canSeeContact(user, existing))) throw new Error('Contact not found')
        if (existing) {
          const { data, error } = await supabase.from('contacts').update(patch).eq('id', id).select().single()
          if (error) throw new Error(error.message)
          return data
        }
        const { data, error } = await supabase.from('contacts').insert({ ...patch, created_by: user.id }).select().single()
        if (error) throw new Error(error.message)
        return data
      }),
  })
}
