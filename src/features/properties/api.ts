import { useMutation, useQuery } from '@tanstack/react-query'
import { db, respond, write } from '../../lib/mock/db'
import { supabase } from '../../lib/supabase'
import { isManager } from '../../lib/rules'
import { useUser } from '../../lib/session'
import { slugify } from '../../lib/format'
import type { Property } from '../../lib/types'

export type PropertyInput = Omit<Property, 'id' | 'slug' | 'created_at' | 'updated_at'>

export const shareUrl = (slug: string) => `${location.origin}/p/${slug}`

export const useProperties = () =>
  useQuery({ queryKey: ['properties'], queryFn: () => respond([...db.properties].sort((a, b) => b.updated_at.localeCompare(a.updated_at))) })

export const useProperty = (id: string | undefined) =>
  useQuery({ queryKey: ['property', id], enabled: !!id, queryFn: () => respond(db.properties.find(p => p.id === id) ?? null) })

/** Public page: fetched directly from Supabase since `db` only mirrors what the signed-in user can see. */
export const usePublicProperty = (slug: string) =>
  useQuery({
    queryKey: ['public-property', slug],
    queryFn: async () => {
      const { data, error } = await supabase.from('properties').select('*').eq('slug', slug).eq('is_public', true).maybeSingle()
      if (error) throw new Error(error.message)
      return data as Property | null
    },
  })

export function useSaveProperty() {
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: PropertyInput }) =>
      write(async () => {
        if (!input.title.trim()) throw new Error('Title is required')
        if (id) {
          const { data, error } = await supabase.from('properties').update(input).eq('id', id).select().single()
          if (error) throw new Error(error.message)
          return data
        }
        const base = slugify(`${input.title} ${input.locality}`) || 'property'
        let slug = base
        for (let i = 2; db.properties.some(p => p.slug === slug); i++) slug = `${base}-${i}`
        const { data, error } = await supabase.from('properties').insert({ ...input, slug }).select().single()
        if (error) throw new Error(error.message)
        return data
      }),
  })
}

export function useDeleteProperty() {
  const user = useUser()
  return useMutation({
    mutationFn: (id: string) =>
      write(async () => {
        if (!isManager(user)) throw new Error('Only owners and managers can delete properties.')
        // FK: drop it from every lead's interest list first (property_ids has no FK of its own).
        for (const l of db.leads.filter(l => l.property_ids.includes(id)))
          await supabase.from('leads').update({ property_ids: l.property_ids.filter(pid => pid !== id) }).eq('id', l.id)
        const { error } = await supabase.from('properties').delete().eq('id', id)
        if (error) throw new Error(error.message)
      }),
  })
}

/** The anon-callable path behind "Enquire Now" on the public property page. No refresh() — there's no signed-in mirror to update. */
export function useSubmitEnquiry(property: Property) {
  return useMutation({
    mutationFn: async (f: { name: string; phone: string; email: string; message: string }) => {
      if (!f.name.trim()) throw new Error('Please enter your name')
      const { error } = await supabase.rpc('capture_lead', {
        p_name: f.name, p_phone: f.phone, p_source: 'property_page', p_email: f.email || null,
        p_property_ids: [property.id], p_pipeline_id: null,
        p_property_interest: `${property.config}, ${property.locality}`, p_budget_min: null, p_budget_max: null,
        p_city: property.city, p_external_ref: null, p_referral_detail: null, p_message: f.message || null, p_notes: null, p_actor_id: null,
      })
      if (error) throw new Error(error.message)
    },
  })
}
