import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { Columns, KanbanSquare, Plus, SlidersHorizontal, X } from 'lucide-react'
import { Button, Loading, PageHeader, SearchBox, inlineInputCls } from '../../components/ui'
import { useProfiles, useUser } from '../../lib/session'
import { isManager, isOpen } from '../../lib/rules'
import { SOURCE_LABEL } from '../../lib/labels'
import { useLeads } from '../leads/api'
import { NewLeadModal } from '../leads/LeadModals'
import { LeadBoard } from '../leads/LeadBoard'
import { usePipelines } from './api'
import { PipelineSetupModal, type SavedKanbanView } from './PipelineSetupModal'

const VIEWS_STORAGE_KEY = 'luxerefy-custom-kanban-views'

/** The board. Leads keeps the list; this module is the stage-by-stage view of the same records. */
export function PipelinePage() {
  const user = useUser()
  const mgr = isManager(user)
  const { data: leads } = useLeads()
  const { data: profiles } = useProfiles()
  const { data: pipes } = usePipelines()
  const [params, setParams] = useSearchParams()
  const [modal, setModal] = useState(false)
  const [setupModal, setSetupModal] = useState(false)

  // Custom Kanban Views state (persisted in localStorage)
  const [views, setViews] = useState<SavedKanbanView[]>(() => {
    try {
      const saved = localStorage.getItem(VIEWS_STORAGE_KEY)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [activeViewId, setActiveViewId] = useState<string | null>(null)

  const handleSaveViews = (nextViews: SavedKanbanView[]) => {
    setViews(nextViews)
    try {
      localStorage.setItem(VIEWS_STORAGE_KEY, JSON.stringify(nextViews))
    } catch {
      // storage unavailable
    }
  }

  // Auto-open customiser if url has ?setup=1
  useEffect(() => {
    if (params.get('setup')) {
      setSetupModal(true)
      setParams(p => { p.delete('setup'); return p }, { replace: true })
    }
  }, [params, setParams])

  const set = (k: string, v: string) => setParams(p => { if (v) p.set(k, v); else p.delete(k); return p }, { replace: true })

  if (!leads || !pipes) return <Loading />

  const pipeline = pipes.find(p => p.id === params.get('pipeline')) ?? pipes[0]
  const source = params.get('source') ?? ''
  const agent = params.get('agent') ?? ''
  const q = params.get('q') ?? ''
  const needle = q.toLowerCase().trim()

  const board = leads.filter(l =>
    (!pipeline || l.pipeline_id === pipeline.id) &&
    (!source || l.source === source) && (!agent || l.assigned_to === agent) &&
    (!needle || [l.contact.name, l.contact.email, l.property_interest, l.property?.title].some(v => v?.toLowerCase().includes(needle)) || l.contact.phone.includes(needle.replace(/\s/g, ''))),
  )
  const open = board.filter(isOpen).length

  const activeView = views.find(v => v.id === activeViewId)

  return (
    <>
      <PageHeader
        icon={KanbanSquare}
        tint="text-emerald-600"
        title={pipes.length > 1 ? (pipeline?.name ?? 'Pipeline') : 'Pipeline'}
        tag={<span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">{open} open</span>}
        subtitle="Drag a card between stages to move the lead along."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => setSetupModal(true)}
              className="border-slate-300 font-medium hover:border-slate-400"
            >
              <SlidersHorizontal className="size-4 text-slate-600" />
              Customise Pipeline
            </Button>
            <Button onClick={() => setModal(true)}>
              <Plus className="size-4" /> New lead
            </Button>
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {pipes.length > 1 && (
          <select value={pipeline?.id ?? ''} onChange={e => set('pipeline', e.target.value)} className={inlineInputCls} aria-label="Pipeline">
            {pipes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}

        {/* Custom Kanban View Selector */}
        {views.length > 0 && (
          <div className="flex items-center gap-1.5 rounded-lg bg-white px-2 py-1 shadow-soft ring-1 ring-slate-200">
            <Columns className="size-3.5 text-slate-400" />
            <select
              value={activeViewId ?? ''}
              onChange={e => setActiveViewId(e.target.value || null)}
              className="border-0 bg-transparent text-xs font-medium text-slate-700 focus:outline-none"
              aria-label="Kanban View"
            >
              <option value="">Default View (All stages)</option>
              {views.map(v => (
                <option key={v.id} value={v.id}>
                  View: {v.name} ({v.visibleStages.length} cols)
                </option>
              ))}
            </select>
            {activeViewId && (
              <button
                type="button"
                onClick={() => setActiveViewId(null)}
                className="text-slate-400 hover:text-slate-600"
                title="Reset to default view"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        )}

        <SearchBox value={q} onChange={v => set('q', v)} placeholder="Search name, phone, property" label="Search leads" className="w-full sm:w-72" />
        <select value={source} onChange={e => set('source', e.target.value)} className={inlineInputCls} aria-label="Filter by source">
          <option value="">All sources</option>
          {Object.entries(SOURCE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {mgr && (
          <select value={agent} onChange={e => set('agent', e.target.value)} className={inlineInputCls} aria-label="Filter by agent">
            <option value="">All agents</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        )}

        {/* Custom button to open pipeline setup & custom kanban view */}
        <button
          type="button"
          onClick={() => setSetupModal(true)}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-200 hover:text-slate-900"
        >
          <SlidersHorizontal className="size-3.5 text-slate-500" />
          Customise Views & Stages
        </button>
      </div>

      {activeView && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-2 text-xs text-emerald-900">
          <div className="flex items-center gap-2">
            <Columns className="size-4 text-emerald-600" />
            <span>
              Showing custom view: <strong>{activeView.name}</strong> ({activeView.visibleStages.length} stages)
            </span>
          </div>
          <button
            type="button"
            onClick={() => setActiveViewId(null)}
            className="font-medium text-emerald-700 underline hover:text-emerald-900"
          >
            Show all columns
          </button>
        </div>
      )}

      <LeadBoard
        leads={board}
        pipelineId={pipeline?.id}
        onAdd={() => setModal(true)}
        visibleStages={activeView?.visibleStages}
      />
      <NewLeadModal open={modal} onClose={() => setModal(false)} />

      {pipeline && (
        <PipelineSetupModal
          open={setupModal}
          onClose={() => setSetupModal(false)}
          pipelines={pipes}
          activePipelineId={pipeline.id}
          onSelectPipeline={id => set('pipeline', id)}
          views={views}
          activeViewId={activeViewId}
          onSelectView={setActiveViewId}
          onSaveViews={handleSaveViews}
        />
      )}
    </>
  )
}
