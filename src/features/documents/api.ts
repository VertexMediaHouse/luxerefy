import { useMutation, useQuery } from '@tanstack/react-query'
import { db, ok, respond, write } from '../../lib/db'
import { supabase } from '../../lib/supabase'
import { canSeeLead, isManager, uid } from '../../lib/rules'
import { useUser } from '../../lib/session'
import type { Doc, Profile } from '../../lib/types'

const MAX_BYTES = 20 * 1024 * 1024

/** RLS already scopes db.documents; this repeats the rule so a scoped list reads the same. */
const canSeeDoc = (user: Profile, d: Doc) => {
  if (isManager(user) || !d.lead_id) return true
  const lead = db.leads.find(l => l.id === d.lead_id)
  return !!lead && canSeeLead(user, lead)
}

const join = (d: Doc) => {
  const lead = db.leads.find(l => l.id === d.lead_id)
  const folder_item = db.doc_folders?.find(f => f.id === d.folder_id) ?? null
  return {
    ...d,
    lead_name: db.contacts.find(c => c.id === lead?.contact_id)?.name ?? null,
    property_title: db.properties.find(p => p.id === d.property_id)?.title ?? null,
    uploader: db.profiles.find(p => p.id === d.uploaded_by)?.full_name ?? '—',
    folder_item,
    starred: !!d.starred,
  }
}
export type DocRow = ReturnType<typeof join>

export function useFolders() {
  const user = useUser()
  return useQuery({
    queryKey: ['doc_folders', user.id],
    queryFn: () => respond(db.doc_folders ?? []),
  })
}

export function useCreateFolder() {
  return useMutation({
    mutationFn: ({ name, parent_id = null, color = 'blue', icon = 'folder' }: { name: string; parent_id?: string | null; color?: string; icon?: string }) =>
      write(async () =>
        ok(await supabase.from('doc_folders').insert({
          id: `f-${uid().slice(0, 8)}`, name: name.trim(), parent_id: parent_id || null, color, icon,
        }).select().single())),
  })
}

export function useDeleteFolder() {
  return useMutation({
    mutationFn: (folderId: string) =>
      write(async () => {
        // documents.folder_id is "on delete set null", and doc_folders.parent_id cascades,
        // so removing the folder detaches its files and its subfolders go with it.
        ok(await supabase.from('doc_folders').delete().eq('id', folderId))
      }),
  })
}

export function useToggleStarDoc() {
  return useMutation({
    mutationFn: (id: string) =>
      write(async () => {
        const d = db.documents.find(doc => doc.id === id)
        if (!d) throw new Error('Document not found')
        return ok(await supabase.from('documents').update({ starred: !d.starred }).eq('id', id).select().single()) as Doc
      }),
  })
}

export function useDocuments(scope: { leadId?: string; propertyId?: string; folderId?: string } = {}) {
  const user = useUser()
  return useQuery({
    queryKey: ['documents', user.id, scope],
    queryFn: () =>
      respond(
        db.documents
          .filter(d => canSeeDoc(user, d) && (!scope.leadId || d.lead_id === scope.leadId) && (!scope.propertyId || d.property_id === scope.propertyId) && (!scope.folderId || d.folder_id === scope.folderId))
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map(join),
      ),
  })
}

export function useUploadDocument() {
  const user = useUser()
  return useMutation({
    mutationFn: async ({ file, folder, folder_id, lead_id, property_id }: { file: File; folder?: string; folder_id?: string | null; lead_id?: string | null; property_id?: string | null }) => {
      if (file.size > MAX_BYTES) throw new Error('Files must be under 20 MB')
      const lead = lead_id ? db.leads.find(l => l.id === lead_id) : null
      if (lead_id && (!lead || !canSeeLead(user, lead))) throw new Error('Lead not found')
      const id = uid()
      const storage_path = `${lead_id ? `lead/${lead_id}` : property_id ? `property/${property_id}` : 'general'}/${id}-${file.name.replace(/[^\w.-]+/g, '_')}` // storage keys reject some characters
      const up = await supabase.storage.from('documents').upload(storage_path, file, { contentType: file.type || 'application/octet-stream' })
      if (up.error) throw new Error(up.error.message)
      return write(async () => {
        const resolvedFolder = folder || (folder_id ? db.doc_folders?.find(f => f.id === folder_id)?.name : 'General Documents') || 'General Documents'
        try {
          const doc = ok(await supabase.from('documents').insert({
            id, folder: resolvedFolder, folder_id: folder_id ?? null,
            lead_id: lead_id ?? null, property_id: property_id ?? null,
            name: file.name, size: file.size, mime: file.type || 'application/octet-stream',
            storage_path, uploaded_by: user.id, starred: false,
          }).select().single()) as Doc
          if (lead_id)
            ok(await supabase.from('lead_activities').insert({
              lead_id, type: 'note', body: `Uploaded ${resolvedFolder} document: ${file.name}`, meta: {}, actor_id: user.id,
            }))
          return doc
        } catch (e) {
          // Don't leave an orphan blob in the bucket that nothing can ever read or delete.
          await supabase.storage.from('documents').remove([storage_path])
          throw e
        }
      })
    },
  })
}

export function useDeleteDocument() {
  const user = useUser()
  return useMutation({
    mutationFn: async (id: string) => {
      const d = db.documents.find(d => d.id === id)
      if (!d || !(isManager(user) || d.uploaded_by === user.id)) throw new Error('Only managers or the uploader can delete this document.')
      // The storage delete policy reads the documents row, so the blob has to go first.
      const rm = await supabase.storage.from('documents').remove([d.storage_path])
      if (rm.error) throw new Error(rm.error.message)
      return write(async () => { ok(await supabase.from('documents').delete().eq('id', id)) })
    },
  })
}

export async function downloadDocument(d: Doc) {
  const { data, error } = await supabase.storage.from('documents').download(d.storage_path)
  if (error || !data) return alert('The file for this document could not be found in storage.')
  const url = URL.createObjectURL(data)
  const a = Object.assign(document.createElement('a'), { href: url, download: d.name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
