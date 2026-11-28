import { useMutation, useQuery } from '@tanstack/react-query'
import { captureRemote, db, ok, respond, write } from '../../lib/db'
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

/** Anon RLS: only rows with is_public = true. */
export const usePublicProperty = (slug: string) =>
  useQuery({ queryKey: ['public-property', slug], queryFn: () => respond(db.properties.find(p => p.slug === slug && p.is_public) ?? null) })

/** slug is unique, so a repeated title gets -2, -3 ... appended. */
function nextSlug(title: string, locality: string) {
  const base = slugify(`${title} ${locality || ''}`) || 'property'
  let slug = base
  for (let i = 2; db.properties.some(p => p.slug === slug); i++) slug = `${base}-${i}`
  return slug
}

export function useSaveProperty() {
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: PropertyInput }) =>
      write(async () => {
        if (!input.title.trim()) throw new Error('Title is required')
        if (id) {
          const res = ok(await supabase.from('properties').update(input).eq('id', id).select().single()) as Property
          const idx = db.properties.findIndex(p => p.id === id)
          if (idx !== -1) db.properties[idx] = res
          else db.properties.unshift(res)
          return res
        }
        const created = ok(await supabase.from('properties').insert({ ...input, slug: nextSlug(input.title, input.locality) }).select().single()) as Property
        db.properties.unshift(created)
        return created
      }),
  })
}

export function useImportProperties() {
  return useMutation({
    mutationFn: (inputs: PropertyInput[]) =>
      write(async () => {
        const taken = new Set(db.properties.map(p => p.slug))
        const rows: (PropertyInput & { slug: string })[] = []
        const failed: { row: number; error: string }[] = []
        inputs.forEach((input, i) => {
          if (!input.title?.trim()) return failed.push({ row: i + 2, error: 'Title is required' })
          // Rows in one file can collide with each other as well as with stored slugs.
          const base = slugify(`${input.title} ${input.locality || ''}`) || 'property'
          let slug = base
          for (let k = 2; taken.has(slug); k++) slug = `${base}-${k}`
          taken.add(slug)
          rows.push({ ...input, slug })
        })
        // One insert for the file: a row that violates a constraint fails the whole import rather
        // than leaving half of it in, which is the behaviour you want for a re-runnable upload.
        if (rows.length) {
          const inserted = ok(await supabase.from('properties').insert(rows).select()) as Property[]
          if (inserted?.length) db.properties.unshift(...inserted)
        }
        return { created: rows.length, failed }
      }),
  })
}

export function useDeleteProperty() {
  const user = useUser()
  return useMutation({
    mutationFn: (id: string) =>
      write(async () => {
        if (!isManager(user)) throw new Error('Only owners and managers can delete properties.')
        const prev = db.properties.find(p => p.id === id)
        // Optimistically remove from memory immediately
        db.properties = db.properties.filter(p => p.id !== id)
        for (const l of db.leads) {
          if (l.property_ids.includes(id)) {
            l.property_ids = l.property_ids.filter(pid => pid !== id)
          }
        }
        try {
          ok(await supabase.from('properties').delete().eq('id', id))
          // property_ids is a plain text[], so no FK drops it: clear it per lead, keeping the history.
          const affectedLeads = db.leads.filter(l => l.property_ids.includes(id))
          if (affectedLeads.length) {
            await Promise.all(affectedLeads.map(l =>
              supabase.from('leads').update({ property_ids: l.property_ids.filter(pid => pid !== id) }).eq('id', l.id)
            ))
          }
        } catch (err) {
          if (prev) db.properties.unshift(prev)
          throw err
        }
      }),
  })
}

/**
 * "Enquire Now" on the public page: anon-callable capture_leads RPC.
 * `cp` comes from the ?cp= tag on a channel partner's copy of the link, so the lead
 * is filed as a referral and credited to that partner.
 */
export function useSubmitEnquiry(property: Property) {
  return useMutation({
    mutationFn: async (f: { name: string; phone: string; email: string; message: string; cp?: string }) => {
      if (!f.name.trim()) throw new Error('Please enter your name')
      const { cp, ...lead } = f
      const partner = cp?.trim() || ''
      const [r] = await captureRemote([{
        ...lead,
        source: partner ? 'referral' : 'property_page',
        referral_detail: partner || null,
        property_ids: [property.id],
        property_interest: `${property.config}, ${property.locality}`, city: property.city,
      }])
      if (r.error !== undefined) throw new Error(r.error)
    },
  })
}
