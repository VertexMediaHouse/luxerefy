import { useMutation, useQuery } from '@tanstack/react-query'
import { db, respond, write } from '../../lib/mock/db'
import { captureLead, isManager, uid } from '../../lib/rules'
import { useUser } from '../../lib/session'
import { slugify } from '../../lib/format'
import type { Property } from '../../lib/types'

export type PropertyInput = Omit<Property, 'id' | 'slug' | 'created_at' | 'updated_at'>

export const shareUrl = (slug: string) => `${location.origin}/p/${slug}`

export const useProperties = () =>
  useQuery({ queryKey: ['properties'], queryFn: () => respond([...db.properties].sort((a, b) => b.updated_at.localeCompare(a.updated_at))) })

export const useProperty = (id: string | undefined) =>
  useQuery({ queryKey: ['property', id], enabled: !!id, queryFn: () => respond(db.properties.find(p => p.id === id) ?? null) })

/** Anon RLS: only rows with is_public = true. */
export const usePublicProperty = (slug: string) =>
  useQuery({ queryKey: ['public-property', slug], queryFn: () => respond(db.properties.find(p => p.slug === slug && p.is_public) ?? null) })

export function useSaveProperty() {
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: PropertyInput }) =>
      write(() => {
        const now = new Date().toISOString()
        if (!input.title.trim()) throw new Error('Title is required')
        const existing = db.properties.find(p => p.id === id)
        if (existing) return Object.assign(existing, input, { updated_at: now })
        const base = slugify(`${input.title} ${input.locality}`) || 'property'
        let slug = base
        for (let i = 2; db.properties.some(p => p.slug === slug); i++) slug = `${base}-${i}`
        const p: Property = { ...input, id: uid(), slug, created_at: now, updated_at: now }
        db.properties.push(p)
        return p
      }),
  })
}

export function useImportProperties() {
  return useMutation({
    mutationFn: (inputs: PropertyInput[]) =>
      write(() => {
        const now = new Date().toISOString()
        let created = 0
        const failed: { row: number; error: string }[] = []
        inputs.forEach((input, i) => {
          try {
            if (!input.title?.trim()) throw new Error('Title is required')
            const base = slugify(`${input.title} ${input.locality || ''}`) || 'property'
            let slug = base
            for (let k = 2; db.properties.some(p => p.slug === slug); k++) slug = `${base}-${k}`
            const p: Property = {
              ...input,
              id: uid(),
              slug,
              created_at: now,
              updated_at: now,
            }
            db.properties.push(p)
            created++
          } catch (e) {
            failed.push({ row: i + 2, error: (e as Error).message })
          }
        })
        return { created, failed }
      }),
  })
}

export function useDeleteProperty() {
  const user = useUser()
  return useMutation({
    mutationFn: (id: string) =>
      write(() => {
        if (!isManager(user)) throw new Error('Only owners and managers can delete properties.')
        db.properties = db.properties.filter(p => p.id !== id)
        // FK: on delete, drop it from every lead's interest list but keep the lead's history.
        for (const l of db.leads) l.property_ids = l.property_ids.filter(pid => pid !== id)
      }),
  })
}

/** Mock of the anon-callable submit_enquiry() RPC behind "Enquire Now". */
export function useSubmitEnquiry(property: Property) {
  return useMutation({
    mutationFn: (f: { name: string; phone: string; email: string; message: string }) =>
      write(() => {
        if (!f.name.trim()) throw new Error('Please enter your name')
        captureLead(db, {
          ...f, source: 'property_page', property_ids: [property.id],
          property_interest: `${property.config}, ${property.locality}`, city: property.city,
        }, null)
      }),
  })
}
