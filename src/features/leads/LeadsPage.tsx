import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Columns, Download, ExternalLink, KanbanSquare, List, Plus, SlidersHorizontal, Upload, Users, X, Zap } from 'lucide-react'
import { Avatar, Button, StageChip, Card, Empty, inlineInputCls, Loading, PageHeader, RecordCount, SearchBox, Segmented, T, Tabs } from '../../components/ui'
import { isOpen } from '../../lib/rules'
import { SOURCE_LABEL } from '../../lib/labels'
import { stagesOf } from '../../lib/stages'
import { budget, prettyPhone, relative } from '../../lib/format'
import type { LeadStatus } from '../../lib/types'
import { interestOf, useLeads } from './api'
import { LeadBoard } from './LeadBoard'
import { NewLeadModal, SimulateWebhookModal } from './LeadModals'
import { ImportLeadsModal } from './ImportModal'
import { useProperties } from '../properties/api'
import { usePipelines } from '../pipeline/api'
import { PipelineSetupModal, type SavedKanbanView } from '../pipeline/PipelineSetupModal'
import { SOURCE_LABEL as SRC_LABELS } from '../../lib/labels'
import { budget as fmtBudget } from '../../lib/format'
import { stageLabel } from '../../lib/stages'

const VIEWS_STORAGE_KEY = 'luxerefy-custom-kanban-views'

async function exportLeads(leads: ReturnType<typeof useLeads>['data']) {
  if (!leads?.length) return
  const XLSX = await import('xlsx')
  const data = leads.map(l => ({
    Name: l.contact.name, Phone: l.contact.phone, Email: l.contact.email ?? '',
    Source: SRC_LABELS[l.source], Stage: stageLabel(l.status),
    Properties: l.properties.map(p => p.title).join(', '),
    Budget: fmtBudget(l.budget_min, l.budget_max), City: l.city ?? '',
    Notes: l.notes, 'Referral detail': l.referral_detail ?? '',
  }))
  const ws = XLSX.utils.json_to_sheet(data)
  ws['!cols'] = Object.keys(data[0]).map(() => ({ wch: 18 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Leads')
  XLSX.writeFile(wb, `luxerefy-leads-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

/**
 * Leads is the whole module now: the list and the board are two views of the same records,
 * and the pipeline customiser opens from here. There is no separate Pipeline page.
 */
export function LeadsPage() {
  const nav = useNavigate()
  const { data: leads } = useLeads()
  const { data: pipes } = usePipelines()
  const { data: properties = [] } = useProperties()
  const [params, setParams] = useSearchParams()
  const [modal, setModal] = useState<'new' | 'webhook' | 'import' | null>(null)
  const [setupOpen, setSetupOpen] = useState(false)

  // Saved board layouts live in localStorage: they are one person's view preference, not CRM data.
  const [views, setViews] = useState<SavedKanbanView[]>(() => {
    try { return JSON.parse(localStorage.getItem(VIEWS_STORAGE_KEY) ?? '[]') } catch { return [] }
  })
  const [activeViewId, setActiveViewId] = useState<string | null>(null)
  const saveViews = (next: SavedKanbanView[]) => {
    setViews(next)
    try { localStorage.setItem(VIEWS_STORAGE_KEY, JSON.stringify(next)) } catch { /* preference just won't persist */ }
  }

  const set = (k: string, v: string) => setParams(p => { if (v && v !== 'all') p.set(k, v); else p.delete(k); return p }, { replace: true })
  // The old /pipeline route and the header's "New lead" both land here with a query flag.
  useEffect(() => {
    if (params.get('new')) { setModal('new'); setParams(p => { p.delete('new'); return p }, { replace: true }) }
    if (params.get('setup')) { setSetupOpen(true); setParams(p => { p.delete('setup'); return p }, { replace: true }) }
  }, [params, setParams])

  if (!leads || !pipes) return <Loading />

  const view = params.get('view') === 'board' ? 'board' : 'list'
  const status = (params.get('status') ?? 'all') as LeadStatus | 'all'
  const source = params.get('source') ?? ''
  const property = params.get('property') ?? ''
  const q = params.get('q') ?? ''
  // One board at a time: the stage filters only mean anything within a single pipeline.
  const pipeline = pipes.find(p => p.id === params.get('pipeline')) ?? pipes[0]
  const stages = pipeline ? stagesOf(pipeline.id) : []
  const needle = q.toLowerCase().trim()
  const base = leads.filter(l =>
    (!pipeline || l.pipeline_id === pipeline.id) &&
    (!source || l.source === source) &&
    (!property || l.property_ids.includes(property)) &&
    (!needle || [l.contact.name, l.contact.email, l.property_interest, ...l.properties.map(p => p.title)].some(v => v?.toLowerCase().includes(needle)) || l.contact.phone.includes(needle.replace(/\s/g, ''))),
  )
  const rows = status === 'all' ? base : base.filter(l => l.status === status)
  const activeView = views.find(v => v.id === activeViewId)

  return (
    <>
      <PageHeader
        icon={Users}
        title="Leads"
        tag={<span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">{view === 'board' ? `${base.filter(isOpen).length} open` : `${leads.length} total`}</span>}
        subtitle="Every enquiry, as a list or a board. Drag a card between stages to move the lead along."
        actions={<>
          <Button variant="secondary" onClick={() => { const u = `${location.origin}/sales-form`; navigator.clipboard.writeText(u).then(() => alert(`Link copied:\n${u}`)) }}><ExternalLink className="size-4 text-slate-500" /> Share form</Button>
          <Button variant="secondary" onClick={() => setSetupOpen(true)}><SlidersHorizontal className="size-4 text-slate-500" /> Customise pipeline</Button>
          <Button variant="secondary" onClick={() => setModal('import')}><Upload className="size-4 text-slate-500" /> Import</Button>
          <Button variant="secondary" onClick={() => void exportLeads(leads)}><Download className="size-4 text-slate-500" /> Export</Button>
          <Button variant="secondary" onClick={() => setModal('webhook')}><Zap className="size-4 text-slate-500" /> Simulate webhook</Button>
          <Button onClick={() => setModal('new')}><Plus className="size-4" /> New lead</Button>
        </>}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Segmented
          label="Lead view"
          value={view}
          onChange={v => set('view', v === 'board' ? 'board' : '')}
          items={[{ value: 'list', label: 'List', icon: List }, { value: 'board', label: 'Board', icon: KanbanSquare }]}
        />
        {pipes.length > 1 && (
          <select value={pipeline?.id ?? ''} onChange={e => set('pipeline', e.target.value)} className={inlineInputCls} aria-label="Pipeline">
            {pipes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <SearchBox value={q} onChange={v => set('q', v)} placeholder="Search name, phone, property" label="Search leads" className="w-full sm:w-72" />
        <select value={source} onChange={e => set('source', e.target.value)} className={inlineInputCls} aria-label="Filter by source">
          <option value="">All sources</option>
          {Object.entries(SOURCE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={property} onChange={e => set('property', e.target.value)} className={`${inlineInputCls} max-w-56`} aria-label="Filter by property">
          <option value="">All properties</option>
          {properties.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        {view === 'board' && views.length > 0 && (
          <div className="flex items-center gap-1.5 rounded-lg bg-white px-2 py-1 shadow-soft ring-1 ring-slate-200/80">
            <Columns className="size-3.5 text-slate-400" />
            <select value={activeViewId ?? ''} onChange={e => setActiveViewId(e.target.value || null)} className="border-0 bg-transparent text-xs font-medium text-slate-700 focus:outline-none" aria-label="Board layout">
              <option value="">All stages</option>
              {views.map(v => <option key={v.id} value={v.id}>{v.name} ({v.visibleStages.length})</option>)}
            </select>
            {activeViewId && (
              <button type="button" onClick={() => setActiveViewId(null)} className="text-slate-400 hover:text-slate-700" title="Show all stages" aria-label="Show all stages">
                <X className="size-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {view === 'board' ? (
        <LeadBoard leads={base} pipelineId={pipeline?.id} onAdd={() => setModal('new')} visibleStages={activeView?.visibleStages} />
      ) : (
        <Card>
          <div className="border-b border-slate-100 px-4 pt-2">
            <Tabs value={status} onChange={v => set('status', v)} items={[
              { value: 'all', label: 'All', count: base.length },
              ...stages.map(s => ({ value: s.id, label: s.label, count: base.filter(l => l.status === s.id).length })),
            ]} />
          </div>
          <div className="overflow-x-auto">
            <table className={T.table}>
              <thead className={T.head}>
                <tr>
                  <th className={T.th}>Lead</th>
                  <th className={`${T.th} hidden md:table-cell`}>Interest</th>
                  <th className={`${T.th} hidden md:table-cell`}>Budget</th>
                  <th className={T.th}>Stage</th>
                  <th className={`${T.th} hidden sm:table-cell`}>Source</th>
                  <th className={`${T.th} hidden text-right lg:table-cell`}>Created</th>
                </tr>
              </thead>
              <tbody className={T.body}>
                {rows.map(l => (
                  <tr key={l.id} onClick={() => nav(`/leads/${l.id}`)} className={T.row}>
                    <td className={T.td}>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={l.contact.name} size="sm" />
                        <div className="min-w-0">
                          <Link to={`/leads/${l.id}`} onClick={e => e.stopPropagation()} className="font-semibold text-slate-900 hover:underline">{l.contact.name}</Link>
                          <div className="text-xs text-slate-500">{prettyPhone(l.contact.phone)}</div>
                        </div>
                      </div>
                    </td>
                    <td className={`${T.td} hidden md:table-cell`}>
                      <div className="max-w-[18rem] truncate text-slate-700">{interestOf(l) ?? '—'}</div>
                      {l.properties.length > 1 && <div className="text-xs text-slate-400">+{l.properties.length - 1} more {l.properties.length === 2 ? 'property' : 'properties'}</div>}
                    </td>
                    <td className={`${T.td} hidden whitespace-nowrap text-slate-600 md:table-cell`}>{budget(l.budget_min, l.budget_max)}</td>
                    <td className={T.td}><StageChip status={l.status} /></td>
                    <td className={`${T.td} hidden text-slate-600 sm:table-cell`}>
                      {SOURCE_LABEL[l.source]}
                      {l.referral_detail && <span className="block max-w-40 truncate text-xs text-slate-400">{l.referral_detail}</span>}
                    </td>
                    <td className={`${T.td} hidden text-right whitespace-nowrap text-slate-500 lg:table-cell`}>{relative(l.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length ? <RecordCount shown={rows.length} total={leads.length} noun="leads" /> : <Empty icon={Users}>No leads match these filters.</Empty>}
        </Card>
      )}

      <ImportLeadsModal open={modal === 'import'} onClose={() => setModal(null)} />
      <NewLeadModal open={modal === 'new'} onClose={() => setModal(null)} />
      <SimulateWebhookModal open={modal === 'webhook'} onClose={() => setModal(null)} />
      {pipeline && (
        <PipelineSetupModal
          open={setupOpen}
          onClose={() => setSetupOpen(false)}
          pipelines={pipes}
          activePipelineId={pipeline.id}
          onSelectPipeline={id => set('pipeline', id)}
          views={views}
          activeViewId={activeViewId}
          onSelectView={setActiveViewId}
          onSaveViews={saveViews}
        />
      )}
    </>
  )
}
