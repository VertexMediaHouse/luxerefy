import { useMutation, useQuery } from '@tanstack/react-query'
import { db, respond, write } from '../../lib/mock/db'
import { supabase } from '../../lib/supabase'
import { deleteFile, getFile, putFile } from '../../lib/mock/files'
import { canSeeLead, isManager } from '../../lib/rules'
import { useUser } from '../../lib/session'
import type { Doc, DocFolder, Profile } from '../../lib/types'

const MAX_BYTES = 20 * 1024 * 1024

/** RLS already scopes `db.documents`; this filter is a harmless no-op on top. */
const canSeeDoc = (user: Profile, d: Doc) => {
  if (isManager(user) || !d.lead_id) return true
  const lead = db.leads.find(l => l.id === d.lead_id)
  return !!lead && canSeeLead(user, lead)
}

const join = (d: Doc) => {
  const lead = db.leads.find(l => l.id === d.lead_id)
  return {
    ...d,
    lead_name: db.contacts.find(c => c.id === lead?.contact_id)?.name ?? null,
    property_title: db.properties.find(p => p.id === d.property_id)?.title ?? null,
    uploader: db.profiles.find(p => p.id === d.uploaded_by)?.full_name ?? '—',
  }
}
export type DocRow = ReturnType<typeof join>

export function useDocuments(scope: { leadId?: string; propertyId?: string } = {}) {
  const user = useUser()
  return useQuery({
    queryKey: ['documents', user.id, scope],
    queryFn: () =>
      respond(
        db.documents
          .filter(d => canSeeDoc(user, d) && (!scope.leadId || d.lead_id === scope.leadId) && (!scope.propertyId || d.property_id === scope.propertyId))
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map(join),
      ),
  })
}

export function useUploadDocument() {
  const user = useUser()
  return useMutation({
    mutationFn: async ({ file, folder, lead_id, property_id }: { file: File; folder: DocFolder; lead_id: string | null; property_id: string | null }) => {
      if (!lead_id && !property_id) throw new Error('Link the document to a lead or a property')
      if (file.size > MAX_BYTES) throw new Error('Files must be under 20 MB')
      const lead = lead_id ? db.leads.find(l => l.id === lead_id) : null
      if (lead_id && (!lead || !canSeeLead(user, lead))) throw new Error('Lead not found')
      return write(async () => {
        // File bytes stay in the browser's local blob store; only metadata is in Supabase.
        // Add a Storage bucket + policy when files need to be shared across devices.
        const storage_path = `${lead_id ? `lead/${lead_id}` : `property/${property_id}`}/${crypto.randomUUID()}-${file.name}`
        const { data, error } = await supabase.from('documents').insert({
          folder, lead_id, property_id, name: file.name, size: file.size, mime: file.type || 'application/octet-stream',
          storage_path, uploaded_by: user.id,
        }).select().single()
        if (error) throw new Error(error.message)
        await putFile(data.id, file)
        if (lead_id) await supabase.from('lead_activities').insert({ lead_id, type: 'note', body: `Uploaded ${folder} document: ${file.name}`, actor_id: user.id, meta: {} })
        return data as Doc
      })
    },
  })
}

export function useDeleteDocument() {
  const user = useUser()
  return useMutation({
    mutationFn: (id: string) =>
      write(async () => {
        const d = db.documents.find(d => d.id === id)
        if (!d || !(isManager(user) || d.uploaded_by === user.id)) throw new Error('Only managers or the uploader can delete this document.')
        const { error } = await supabase.from('documents').delete().eq('id', id)
        if (error) throw new Error(error.message)
        await deleteFile(id)
      }),
  })
}

export async function downloadDocument(d: Doc) {
  const blob = await getFile(d.id)
  if (!blob) return alert('This record has no file attached in this browser. Files uploaded from this device download normally.')
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: d.name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
