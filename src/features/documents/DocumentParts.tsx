import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Download, FileText, FolderOpen, Trash2, Upload } from 'lucide-react'
import { Badge, Button, Card, CardHeader, Empty, ErrorText, Field, HeaderLink, inputCls, Modal } from '../../components/ui'
import { useUser } from '../../lib/session'
import { isManager } from '../../lib/rules'
import { DOC_FOLDERS } from '../../lib/labels'
import { fileSize, shortDate } from '../../lib/format'
import type { DocFolder } from '../../lib/types'
import { useLeads } from '../leads/api'
import { useProperties } from '../properties/api'
import { downloadDocument, useDeleteDocument, useDocuments, useUploadDocument, type DocRow } from './api'

export function DocList({ docs, showLinks }: { docs: DocRow[]; showLinks?: boolean }) {
  const user = useUser()
  const del = useDeleteDocument()
  if (!docs.length) return <Empty icon={FolderOpen}>No documents yet.</Empty>
  return (
    <>
      <ErrorText error={del.error} />
      <ul className="divide-y divide-slate-100">
        {docs.map(d => (
          <li key={d.id} className="flex items-center gap-3 px-5 py-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600 ring-1 ring-rose-600/10"><FileText className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">{d.name}</p>
              <p className="truncate text-xs text-slate-500">
                {fileSize(d.size)}, {shortDate(d.created_at)}, {d.uploader}
                {showLinks && d.lead_id && <>, <Link to={`/leads/${d.lead_id}`} className="font-semibold text-blue-700 hover:underline">{d.lead_name}</Link></>}
                {showLinks && d.property_id && <>, <Link to={`/properties/${d.property_id}`} className="font-semibold text-blue-700 hover:underline">{d.property_title}</Link></>}
              </p>
            </div>
            <span className="hidden sm:inline"><Badge dot={false}>{d.folder}</Badge></span>
            <button type="button" onClick={() => downloadDocument(d)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-blue-700" aria-label={`Download ${d.name}`}><Download className="size-4" /></button>
            {(isManager(user) || d.uploaded_by === user.id) && (
              <button type="button" onClick={() => confirm(`Delete ${d.name}?`) && del.mutate(d.id)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Delete ${d.name}`}><Trash2 className="size-4" /></button>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

/** Upload against a fixed lead/property (panel) or let the user pick one (library page). */
export function UploadModal({ open, onClose, leadId, propertyId }: { open: boolean; onClose: () => void; leadId?: string; propertyId?: string }) {
  return <Modal open={open} onClose={onClose} title="Upload document"><UploadForm onDone={onClose} leadId={leadId} propertyId={propertyId} /></Modal>
}

function UploadForm({ onDone, leadId, propertyId }: { onDone: () => void; leadId?: string; propertyId?: string }) {
  const upload = useUploadDocument()
  const { data: leads = [] } = useLeads()
  const { data: properties = [] } = useProperties()
  const fixed = !!(leadId || propertyId)

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const s = (k: string) => String(f.get(k) ?? '')
    upload.mutate(
      { file: f.get('file') as File, folder: s('folder') as DocFolder, lead_id: leadId ?? (s('lead_id') || null), property_id: propertyId ?? (s('property_id') || null) },
      { onSuccess: onDone },
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="File" hint="PDF, images or Office files, up to 20 MB">
        <input name="file" type="file" required accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.zip" className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100" />
      </Field>
      <Field label="Folder">
        <select name="folder" defaultValue={leadId ? 'Agreements' : 'Property'} className={inputCls}>
          {DOC_FOLDERS.map(f => <option key={f}>{f}</option>)}
        </select>
      </Field>
      {!fixed && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Lead">
            <select name="lead_id" defaultValue="" className={inputCls}>
              <option value="">None</option>
              {leads.map(l => <option key={l.id} value={l.id}>{l.contact.name}</option>)}
            </select>
          </Field>
          <Field label="Property">
            <select name="property_id" defaultValue="" className={inputCls}>
              <option value="">None</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </Field>
        </div>
      )}
      <div className="flex items-center justify-end gap-3">
        <ErrorText error={upload.error} />
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={upload.isPending}><Upload className="size-4" /> Upload</Button>
      </div>
    </form>
  )
}

export function DocumentsPanel({ leadId, propertyId }: { leadId?: string; propertyId?: string }) {
  const { data = [] } = useDocuments({ leadId, propertyId })
  const [open, setOpen] = useState(false)
  return (
    <Card>
      <CardHeader icon={FileText} title="Documents" subtitle={data.length ? `${data.length} on file` : 'Nothing uploaded yet'} action={<HeaderLink onClick={() => setOpen(true)}>Upload</HeaderLink>} />
      <DocList docs={data} />
      <UploadModal open={open} onClose={() => setOpen(false)} leadId={leadId} propertyId={propertyId} />
    </Card>
  )
}
