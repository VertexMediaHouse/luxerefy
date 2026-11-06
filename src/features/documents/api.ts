import { useMutation, useQuery } from '@tanstack/react-query'
import { db, respond, write } from '../../lib/mock/db'
import { deleteFile, getFile, putFile } from '../../lib/mock/files'
import { canSeeLead, isManager, logActivity, uid } from '../../lib/rules'
import { useUser } from '../../lib/session'
import type { Doc, DocFolderItem, Profile } from '../../lib/types'

const MAX_BYTES = 20 * 1024 * 1024

/** Storage RLS stand-in: client paperwork follows the lead; property-only docs are visible to all staff. */
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
      write(() => {
        if (!db.doc_folders) db.doc_folders = []
        const newFolder: DocFolderItem = {
          id: `f-${uid().slice(0, 8)}`,
          name: name.trim(),
          parent_id: parent_id || null,
          color,
          icon,
          created_at: new Date().toISOString(),
        }
        db.doc_folders.push(newFolder)
        return newFolder
      }),
  })
}

export function useDeleteFolder() {
  return useMutation({
    mutationFn: (folderId: string) =>
      write(() => {
        if (!db.doc_folders) return
        db.doc_folders = db.doc_folders.filter(f => f.id !== folderId && f.parent_id !== folderId)
        db.documents.forEach(d => {
          if (d.folder_id === folderId) {
            d.folder_id = null
          }
        })
      }),
  })
}

export function useToggleStarDoc() {
  return useMutation({
    mutationFn: (id: string) =>
      write(() => {
        const d = db.documents.find(doc => doc.id === id)
        if (d) {
          d.starred = !d.starred
        }
        return d
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
      await putFile(id, file)
      return write(() => {
        const now = new Date().toISOString()
        const resolvedFolder = folder || (folder_id ? db.doc_folders?.find(f => f.id === folder_id)?.name : 'General Documents') || 'General Documents'
        const doc: Doc = {
          id, folder: resolvedFolder, folder_id: folder_id ?? null,
          lead_id: lead_id ?? null, property_id: property_id ?? null,
          name: file.name, size: file.size, mime: file.type || 'application/octet-stream',
          storage_path: `${lead_id ? `lead/${lead_id}` : property_id ? `property/${property_id}` : 'general'}/${id}-${file.name}`,
          uploaded_by: user.id, created_at: now, starred: false,
        }
        db.documents.push(doc)
        if (lead_id) logActivity(db, lead_id, 'note', `Uploaded ${resolvedFolder} document: ${file.name}`, user.id, now)
        return doc
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
      await deleteFile(id)
      return write(() => { db.documents = db.documents.filter(x => x.id !== id) })
    },
  })
}

export async function downloadDocument(d: Doc) {
  const blob = await getFile(d.id)
  if (!blob) return alert('This is a sample record in the demo; no file is attached. Uploaded files download normally.')
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: d.name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
