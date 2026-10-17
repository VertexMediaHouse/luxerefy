import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { KanbanSquare, Plus, Settings2 } from 'lucide-react'
import { Button, Loading, PageHeader, SearchBox, inlineInputCls } from '../../components/ui'
import { useProfiles, useUser } from '../../lib/session'
import { isManager, isOpen } from '../../lib/rules'
import { SOURCE_LABEL } from '../../lib/labels'
import { useLeads } from '../leads/api'
import { NewLeadModal } from '../leads/LeadModals'
import { LeadBoard } from '../leads/LeadBoard'
import { usePipelines } from './api'

/** The board. Leads keeps the list; this module is the stage-by-stage view of the same records. */
export function PipelinePage() {
  const user = useUser()
  const mgr = isManager(user)
  const { data: leads } = useLeads()
  const { data: profiles } = useProfiles()
  const { data: pipes } = usePipelines()
  const [params, setParams] = useSearchParams()
  const [modal, setModal] = useState(false)
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

  return (
    <>
      <PageHeader
        icon={KanbanSquare}
        tint="text-emerald-600"
        title={pipes.length > 1 ? (pipeline?.name ?? 'Pipeline') : 'Pipeline'}
        tag={<span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">{open} open</span>}
        subtitle="Drag a card between stages to move the lead along."
        actions={<Button onClick={() => setModal(true)}><Plus className="size-4" /> New lead</Button>}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
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
        {mgr && (
          <select value={agent} onChange={e => set('agent', e.target.value)} className={inlineInputCls} aria-label="Filter by agent">
            <option value="">All agents</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        )}
        {mgr && (
          <Link to="/pipelines" className="ml-auto flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900">
            <Settings2 className="size-4" /> Edit stages
          </Link>
        )}
      </div>

      <LeadBoard leads={board} pipelineId={pipeline?.id} onAdd={() => setModal(true)} />
      <NewLeadModal open={modal} onClose={() => setModal(false)} />
    </>
  )
}
