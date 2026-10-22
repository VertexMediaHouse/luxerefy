import { useState } from 'react'
import { FileText, Upload } from 'lucide-react'
import { Button, Card, inlineInputCls, Loading, PageHeader, RecordCount, SearchBox, Tabs, Toolbar } from '../../components/ui'
import { DOC_FOLDERS } from '../../lib/labels'
import type { DocFolder } from '../../lib/types'
import { useDocuments } from './api'
import { DocList, UploadModal } from './DocumentParts'
import { useProperties } from '../properties/api'

export function DocumentsPage() {
  const { data } = useDocuments()
  const { data: properties = [] } = useProperties()
  const [folder, setFolder] = useState<DocFolder | 'all'>('all')
  const [q, setQ] = useState('')
  const [propertyFilter, setPropertyFilter] = useState('')
  const [uploading, setUploading] = useState(false)
  if (!data) return <Loading />

  const needle = q.toLowerCase()
  const base = data.filter(d => !needle || [d.name, d.lead_name, d.property_title].some(v => v?.toLowerCase().includes(needle)))
  let rows = folder === 'all' ? base : base.filter(d => d.folder === folder)
  // Property filter applies only in Company Brochures
  if (folder === 'Company Brochures' && propertyFilter) rows = rows.filter(d => d.property_id === propertyFilter)

  return (
    <>
      <PageHeader icon={FileText} title="Documents" subtitle="Company brochures, agreements, KYC and general files, filed against the lead or property" actions={<Button onClick={() => setUploading(true)}><Upload className="size-4" /> Upload</Button>} />
      <Card>
        <Toolbar>
          <Tabs value={folder} onChange={v => { setFolder(v); setPropertyFilter('') }} items={[{ value: 'all', label: 'All', count: base.length }, ...DOC_FOLDERS.map(f => ({ value: f, label: f, count: base.filter(d => d.folder === f).length }))]} />
          <div className="flex items-center gap-2">
            {folder === 'Company Brochures' && (
              <select value={propertyFilter} onChange={e => setPropertyFilter(e.target.value)} className={inlineInputCls} aria-label="Filter by property">
                <option value="">All properties</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            )}
            <SearchBox value={q} onChange={setQ} placeholder="Search file, lead or property" label="Search documents" className="lg:w-72" />
          </div>
        </Toolbar>
        <DocList docs={rows} showLinks />
        {rows.length > 0 && <RecordCount shown={rows.length} total={data.length} noun="documents" />}
      </Card>
      <UploadModal open={uploading} onClose={() => setUploading(false)} />
    </>
  )
}
