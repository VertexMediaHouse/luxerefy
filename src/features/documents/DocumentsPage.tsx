import { useState } from 'react'
import { FileText, Upload } from 'lucide-react'
import { Button, Card, Loading, PageHeader, RecordCount, SearchBox, Tabs, Toolbar } from '../../components/ui'
import { DOC_FOLDERS } from '../../lib/labels'
import type { DocFolder } from '../../lib/types'
import { useDocuments } from './api'
import { DocList, UploadModal } from './DocumentParts'

export function DocumentsPage() {
  const { data } = useDocuments()
  const [folder, setFolder] = useState<DocFolder | 'all'>('all')
  const [q, setQ] = useState('')
  const [uploading, setUploading] = useState(false)
  if (!data) return <Loading />

  const needle = q.toLowerCase()
  const base = data.filter(d => !needle || [d.name, d.lead_name, d.property_title].some(v => v?.toLowerCase().includes(needle)))
  const rows = folder === 'all' ? base : base.filter(d => d.folder === folder)

  return (
    <>
      <PageHeader icon={FileText} tint="text-amber-500" title="Documents" subtitle="Agreements, KYC and property files, filed against the lead or property" actions={<Button onClick={() => setUploading(true)}><Upload className="size-4" /> Upload</Button>} />
      <Card>
        <Toolbar>
          <Tabs value={folder} onChange={setFolder} items={[{ value: 'all', label: 'All', count: base.length }, ...DOC_FOLDERS.map(f => ({ value: f, label: f, count: base.filter(d => d.folder === f).length }))]} />
          <SearchBox value={q} onChange={setQ} placeholder="Search file, lead or property" label="Search documents" className="lg:w-72" />
        </Toolbar>
        <DocList docs={rows} showLinks />
        {rows.length > 0 && <RecordCount shown={rows.length} total={data.length} noun="documents" />}
      </Card>
      <UploadModal open={uploading} onClose={() => setUploading(false)} />
    </>
  )
}
