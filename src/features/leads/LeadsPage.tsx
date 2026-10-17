import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Plus, Upload, Users, Zap } from 'lucide-react'
import { Avatar, Button, StageChip, Card, Empty, inlineInputCls, Loading, PageHeader, RecordCount, SearchBox, T, Tabs } from '../../components/ui'
import { useProfiles, useUser } from '../../lib/session'
import { isManager } from '../../lib/rules'
import { SOURCE_LABEL } from '../../lib/labels'
import { stagesOf } from '../../lib/stages'
import { budget, prettyPhone, relative } from '../../lib/format'
import type { LeadStatus } from '../../lib/types'
import { useLeads } from './api'
import { NewLeadModal, SimulateWebhookModal } from './LeadModals'
import { ImportLeadsModal } from './ImportModal'
import { usePipelines } from '../pipeline/api'

export function LeadsPage() {
  const user = useUser()
  const mgr = isManager(user)
  const nav = useNavigate()
  const { data: leads } = useLeads()
  const { data: profiles } = useProfiles()
  const { data: pipes } = usePipelines()
  const [params, setParams] = useSearchParams()
  const [modal, setModal] = useState<'new' | 'webhook' | 'import' | null>(null)

  const status = (params.get('status') ?? 'all') as LeadStatus | 'all'
  const source = params.get('source') ?? ''
  const agent = params.get('agent') ?? ''
  const q = params.get('q') ?? ''
  const set = (k: string, v: string) => setParams(p => { if (v && v !== 'all') p.set(k, v); else p.delete(k); return p }, { replace: true })
  // The header's "New lead" button links here with ?new=1.
  useEffect(() => { if (params.get('new')) { setModal('new'); setParams(p => { p.delete('new'); return p }, { replace: true }) } }, [params, setParams])

  if (!leads || !pipes) return <Loading />
  // One board at a time: the stage filters below only mean anything within a single pipeline.
  const pipeline = pipes.find(p => p.id === params.get('pipeline')) ?? pipes[0]
  const stages = pipeline ? stagesOf(pipeline.id) : []
  const needle = q.toLowerCase().trim()
  const base = leads.filter(l =>
    (!pipeline || l.pipeline_id === pipeline.id) &&
    (!source || l.source === source) && (!agent || l.assigned_to === agent) &&
    (!needle || [l.contact.name, l.contact.email, l.property_interest, l.property?.title].some(v => v?.toLowerCase().includes(needle)) || l.contact.phone.includes(needle.replace(/\s/g, ''))),
  )
  const rows = status === 'all' ? base : base.filter(l => l.status === status)
  const filters = <>
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
  </>

  return (
    <>
      <PageHeader
        icon={Users}
        tint="text-blue-600"
        title="Leads"
        tag={<span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">{leads.length} total</span>}
        subtitle={mgr ? 'Every enquiry across the team' : 'Leads assigned to you'}
        actions={<>
          <Button variant="secondary" onClick={() => setModal('import')}><Upload className="size-4 text-slate-500" /> Import</Button>
          <Button variant="secondary" onClick={() => setModal('webhook')}><Zap className="size-4 text-slate-500" /> Simulate webhook</Button>
          <Button onClick={() => setModal('new')}><Plus className="size-4" /> New lead</Button>
        </>}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {pipes.length > 1 && (
          <select value={pipeline?.id ?? ''} onChange={e => set('pipeline', e.target.value)} className={inlineInputCls} aria-label="Pipeline">
            {pipes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        {filters}
      </div>

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
                {mgr && <th className={`${T.th} hidden lg:table-cell`}>Agent</th>}
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
                        <Link to={`/leads/${l.id}`} onClick={e => e.stopPropagation()} className="font-semibold text-slate-900 hover:text-blue-700 hover:underline">{l.contact.name}</Link>
                        <div className="text-xs text-slate-500">{prettyPhone(l.contact.phone)}</div>
                      </div>
                    </div>
                  </td>
                  <td className={`${T.td} hidden md:table-cell`}><div className="max-w-[18rem] truncate text-slate-700">{l.property?.title ?? l.property_interest ?? '—'}</div></td>
                  <td className={`${T.td} hidden whitespace-nowrap text-slate-600 md:table-cell`}>{budget(l.budget_min, l.budget_max)}</td>
                  <td className={T.td}><StageChip status={l.status} /></td>
                  <td className={`${T.td} hidden text-slate-600 sm:table-cell`}>{SOURCE_LABEL[l.source]}</td>
                  {mgr && <td className={`${T.td} hidden text-slate-700 lg:table-cell`}>{l.agent?.full_name ?? <span className="text-slate-400">Unassigned</span>}</td>}
                  <td className={`${T.td} hidden text-right whitespace-nowrap text-slate-500 lg:table-cell`}>{relative(l.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length ? <RecordCount shown={rows.length} total={leads.length} noun="leads" /> : <Empty icon={Users}>No leads match these filters.</Empty>}
      </Card>

      <ImportLeadsModal open={modal === 'import'} onClose={() => setModal(null)} />
      <NewLeadModal open={modal === 'new'} onClose={() => setModal(null)} />
      <SimulateWebhookModal open={modal === 'webhook'} onClose={() => setModal(null)} />
    </>
  )
}
