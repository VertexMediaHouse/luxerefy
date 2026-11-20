import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useBase } from '../../lib/session'
import {
  Columns,
  Download,
  ExternalLink,
  KanbanSquare,
  List,
  Plus,
  SlidersHorizontal,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import {
  Avatar,
  Button,
  StageChip,
  Card,
  Empty,
  inlineInputCls,
  Loading,
  PageHeader,
  RecordCount,
  SearchBox,
  Segmented,
  T,
  Tabs,
} from '../../components/ui'
import { isOpen } from '../../lib/rules'
import { SOURCE_LABEL } from '../../lib/labels'
import { stagesOf } from '../../lib/stages'
import { budget, prettyPhone, relative } from '../../lib/format'
import type { LeadStatus } from '../../lib/types'
import { db } from '../../lib/db'
import { interestOf, useDeleteLeads, useLeads } from './api'
import { LeadBoard } from './LeadBoard'
import { NewLeadModal } from './LeadModals'
import { ImportLeadsModal } from './ImportModal'
import { ShareFormModal } from './ShareFormModal'
import { LeadAssignmentModal } from './LeadAssignmentModal'
import { useProperties } from '../properties/api'
import { usePipelines } from '../pipeline/api'
import { useSalesUsers } from '../sales-team/api'
import { PipelineSetupModal, type SavedKanbanView } from '../pipeline/PipelineSetupModal'
import { SOURCE_LABEL as SRC_LABELS } from '../../lib/labels'
import { budget as fmtBudget } from '../../lib/format'
import { stageLabel } from '../../lib/stages'

const VIEWS_STORAGE_KEY = 'luxerefy-custom-kanban-views'

async function exportLeads(leads: ReturnType<typeof useLeads>['data']) {
  if (!leads?.length) return
  const XLSX = await import('xlsx')
  const data = leads.map(l => {
    const assignee = db.profiles.find(p => p.id === l.assigned_to)
    return {
      Name: l.contact.name,
      Phone: l.contact.phone,
      Email: l.contact.email ?? '',
      Source: SRC_LABELS[l.source],
      Stage: stageLabel(l.status),
      Properties: l.properties.map(p => p.title).join(', '),
      Budget: fmtBudget(l.budget_min, l.budget_max),
      City: l.city ?? '',
      Assignee: assignee ? assignee.full_name : 'Unassigned',
      Notes: l.notes,
      'Referral detail': l.referral_detail ?? '',
    }
  })
  const ws = XLSX.utils.json_to_sheet(data)
  ws['!cols'] = Object.keys(data[0]).map(() => ({ wch: 18 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Leads')
  XLSX.writeFile(wb, `luxerefy-leads-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export function LeadsPage() {
  const nav = useNavigate()
  const root = useBase()
  const { data: leads, refetch } = useLeads()
  const { data: pipes } = usePipelines()
  const { data: properties = [] } = useProperties()
  const { data: salesUsers = [] } = useSalesUsers()
  const [params, setParams] = useSearchParams()
  const [modal, setModal] = useState<'new' | 'import' | 'assign' | null>(null)
  const [setupOpen, setSetupOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const delMany = useDeleteLeads()

  // Saved board layouts live in localStorage
  const [views, setViews] = useState<SavedKanbanView[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(VIEWS_STORAGE_KEY) ?? '[]')
    } catch {
      return []
    }
  })
  const [activeViewId, setActiveViewId] = useState<string | null>(null)
  const saveViews = (next: SavedKanbanView[]) => {
    setViews(next)
    try {
      localStorage.setItem(VIEWS_STORAGE_KEY, JSON.stringify(next))
    } catch {}
  }

  const set = (k: string, v: string) =>
    setParams(
      p => {
        if (v && v !== 'all') p.set(k, v)
        else p.delete(k)
        return p
      },
      { replace: true },
    )

  useEffect(() => {
    if (params.get('new')) {
      setModal('new')
      setParams(
        p => {
          p.delete('new')
          return p
        },
        { replace: true },
      )
    }
    if (params.get('setup')) {
      setSetupOpen(true)
      setParams(
        p => {
          p.delete('setup')
          return p
        },
        { replace: true },
      )
    }
  }, [params, setParams])

  if (!leads || !pipes) return <Loading />

  const view = params.get('view') === 'board' ? 'board' : 'list'
  const status = (params.get('status') ?? 'all') as LeadStatus | 'all'
  const source = params.get('source') ?? ''
  const property = params.get('property') ?? ''
  const assigned = params.get('assigned') ?? ''
  const q = params.get('q') ?? ''

  const pipeline = pipes.find(p => p.id === params.get('pipeline')) ?? pipes[0]
  const stages = pipeline ? stagesOf(pipeline.id) : []
  const needle = q.toLowerCase().trim()

  const base = leads.filter(
    l =>
      (!pipeline || l.pipeline_id === pipeline.id) &&
      (!source || l.source === source) &&
      (!property || l.property_ids.includes(property)) &&
      (!assigned ||
        (assigned === 'unassigned' ? !l.assigned_to : l.assigned_to === assigned)) &&
      (!needle ||
        [l.contact.name, l.contact.email, l.property_interest, ...l.properties.map(p => p.title)].some(v =>
          v?.toLowerCase().includes(needle),
        ) ||
        l.contact.phone.includes(needle.replace(/\s/g, ''))),
  )

  const rows = status === 'all' ? base : base.filter(l => l.status === status)
  const activeView = views.find(v => v.id === activeViewId)

  // Selection handlers
  const toggleSelect = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(rows.map(r => r.id)))
    }
  }

  return (
    <>
      <PageHeader
        icon={Users}
        title="Leads"
        tag={
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
            {view === 'board' ? `${base.filter(isOpen).length} open` : `${leads.length} total`}
          </span>
        }
        subtitle="Every enquiry, as a list or a board. Drag a card between stages to move the lead along."
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => setShareOpen(true)}>
          <ExternalLink className="size-4 text-slate-500" /> Share form
        </Button>
        <Button variant="secondary" onClick={() => setSetupOpen(true)}>
          <SlidersHorizontal className="size-4 text-slate-500" /> Customise pipeline
        </Button>
        <Button variant="secondary" onClick={() => setModal('import')}>
          <Upload className="size-4 text-slate-500" /> Import
        </Button>
        <Button variant="secondary" onClick={() => void exportLeads(leads)}>
          <Download className="size-4 text-slate-500" /> Export
        </Button>
        <Button variant="secondary" onClick={() => setModal('assign')}>
          <UserCheck className="size-4 text-blue-600" /> Assign & Distribute
        </Button>
        <Button onClick={() => setModal('new')}>
          <Plus className="size-4" /> New lead
        </Button>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Segmented
          label="Lead view"
          value={view}
          onChange={v => set('view', v === 'board' ? 'board' : '')}
          items={[
            { value: 'list', label: 'List', icon: List },
            { value: 'board', label: 'Board', icon: KanbanSquare },
          ]}
        />
        {pipes.length > 1 && (
          <select
            value={pipeline?.id ?? ''}
            onChange={e => set('pipeline', e.target.value)}
            className={inlineInputCls}
            aria-label="Pipeline"
          >
            {pipes.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <SearchBox
          value={q}
          onChange={v => set('q', v)}
          placeholder="Search name, phone, property"
          label="Search leads"
          className="w-full sm:w-72"
        />
        <select
          value={source}
          onChange={e => set('source', e.target.value)}
          className={inlineInputCls}
          aria-label="Filter by source"
        >
          <option value="">All sources</option>
          {Object.entries(SOURCE_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select
          value={property}
          onChange={e => set('property', e.target.value)}
          className={`${inlineInputCls} max-w-56`}
          aria-label="Filter by property"
        >
          <option value="">All properties</option>
          {properties.map(p => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        <select
          value={assigned}
          onChange={e => set('assigned', e.target.value)}
          className={`${inlineInputCls} max-w-52`}
          aria-label="Filter by assigned rep"
        >
          <option value="">All assignees</option>
          <option value="unassigned">Unassigned only</option>
          {salesUsers.map(u => (
            <option key={u.id} value={u.id}>
              Assigned: {u.full_name}
            </option>
          ))}
        </select>

        {view === 'board' && views.length > 0 && (
          <div className="flex items-center gap-1.5 rounded-lg bg-white px-2 py-1 shadow-soft ring-1 ring-slate-200/80">
            <Columns className="size-3.5 text-slate-400" />
            <select
              value={activeViewId ?? ''}
              onChange={e => setActiveViewId(e.target.value || null)}
              className="border-0 bg-transparent text-xs font-medium text-slate-700 focus:outline-none"
              aria-label="Board layout"
            >
              <option value="">All stages</option>
              {views.map(v => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.visibleStages.length})
                </option>
              ))}
            </select>
            {activeViewId && (
              <button
                type="button"
                onClick={() => setActiveViewId(null)}
                className="text-slate-400 hover:text-slate-700"
                title="Show all stages"
                aria-label="Show all stages"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Floating bulk action bar: fixed at the bottom so selecting never shifts the table */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-slate-900 px-4 py-2.5 text-white shadow-2xl">
          <div className="flex items-center gap-2 text-sm font-medium whitespace-nowrap">
            <span className="flex size-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold">
              {selectedIds.size}
            </span>
            <span>selected</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              className="bg-white/10 text-white border-white/20 hover:bg-white/20"
              onClick={() => setModal('assign')}
            >
              <UserCheck className="size-4 text-blue-400" /> Assign To…
            </Button>
            <Button
              variant="secondary"
              className="bg-red-500/15 text-red-300 border-red-400/30 hover:bg-red-500/25"
              disabled={delMany.isPending}
              onClick={() => {
                if (!confirm(`Delete ${selectedIds.size} lead(s)? This cannot be undone.`)) return
                delMany.mutate(Array.from(selectedIds), {
                  onSuccess: () => {
                    setSelectedIds(new Set())
                    refetch()
                  },
                  onError: e => alert(e instanceof Error ? e.message : 'Delete failed'),
                })
              }}
            >
              <Trash2 className="size-4" /> {delMany.isPending ? 'Deleting…' : 'Delete'}
            </Button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="rounded-lg px-2.5 py-1.5 text-xs text-slate-400 hover:text-white"
            >
              Clear selection
            </button>
          </div>
        </div>
      )}

      {view === 'board' ? (
        <LeadBoard
          leads={base}
          pipelineId={pipeline?.id}
          onAdd={() => setModal('new')}
          visibleStages={activeView?.visibleStages}
        />
      ) : (
        <Card>
          <div className="border-b border-slate-100 px-4 pt-2">
            <Tabs
              value={status}
              onChange={v => set('status', v)}
              items={[
                { value: 'all', label: 'All', count: base.length },
                ...stages.map(s => ({
                  value: s.id,
                  label: s.label,
                  count: base.filter(l => l.status === s.id).length,
                })),
              ]}
            />
          </div>
          <div className="overflow-x-auto">
            <table className={T.table}>
              <thead className={T.head}>
                <tr>
                  <th className="w-10 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={rows.length > 0 && selectedIds.size === rows.length}
                      onChange={toggleSelectAll}
                      className="size-4 rounded accent-blue-600 cursor-pointer"
                      aria-label="Select all leads"
                    />
                  </th>
                  <th className={T.th}>Lead</th>
                  <th className={`${T.th} hidden md:table-cell`}>Interest</th>
                  <th className={`${T.th} hidden md:table-cell`}>Budget</th>
                  <th className={T.th}>Stage</th>
                  <th className={T.th}>Assignee</th>
                  <th className={`${T.th} hidden sm:table-cell`}>Source</th>
                  <th className={`${T.th} hidden text-right lg:table-cell`}>Created</th>
                </tr>
              </thead>
              <tbody className={T.body}>
                {rows.map(l => {
                  const assignee = db.profiles.find(p => p.id === l.assigned_to)
                  const isSelected = selectedIds.has(l.id)
                  return (
                    <tr
                      key={l.id}
                      onClick={() => nav(`${root}/leads/${l.id}`)}
                      className={`${T.row} ${isSelected ? 'bg-blue-50/50' : ''}`}
                    >
                      <td className="w-10 px-3 py-2.5" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(l.id)}
                          className="size-4 rounded accent-blue-600 cursor-pointer"
                          aria-label={`Select ${l.contact.name}`}
                        />
                      </td>
                      <td className={T.td}>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={l.contact.name} size="sm" />
                          <div className="min-w-0">
                            <Link
                              to={`${root}/leads/${l.id}`}
                              onClick={e => e.stopPropagation()}
                              className="font-semibold text-slate-900 hover:underline"
                            >
                              {l.contact.name}
                            </Link>
                            <div className="text-xs text-slate-500">{prettyPhone(l.contact.phone)}</div>
                          </div>
                        </div>
                      </td>
                      <td className={`${T.td} hidden md:table-cell`}>
                        <div className="max-w-[18rem] truncate text-slate-700">{interestOf(l) ?? '—'}</div>
                        {l.properties.length > 1 && (
                          <div className="text-xs text-slate-400">
                            +{l.properties.length - 1} more{' '}
                            {l.properties.length === 2 ? 'property' : 'properties'}
                          </div>
                        )}
                      </td>
                      <td className={`${T.td} hidden whitespace-nowrap text-slate-600 md:table-cell`}>
                        {budget(l.budget_min, l.budget_max)}
                      </td>
                      <td className={T.td}>
                        <StageChip status={l.status} />
                      </td>
                      <td className={T.td} onClick={e => e.stopPropagation()}>
                        {assignee ? (
                          <div
                            className="inline-flex items-center gap-1.5 cursor-pointer hover:opacity-80"
                            onClick={() => {
                              setSelectedIds(new Set([l.id]))
                              setModal('assign')
                            }}
                            title="Click to reassign"
                          >
                            <Avatar name={assignee.full_name} size="xs" />
                            <span className="text-xs font-medium text-slate-700 truncate max-w-28">
                              {assignee.full_name}
                            </span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedIds(new Set([l.id]))
                              setModal('assign')
                            }}
                            className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-200"
                          >
                            <UserPlus className="size-3" /> Unassigned
                          </button>
                        )}
                      </td>
                      <td className={`${T.td} hidden text-slate-600 sm:table-cell`}>
                        {SOURCE_LABEL[l.source]}
                        {l.referral_detail && (
                          <span className="block max-w-40 truncate text-xs text-slate-400">
                            {l.referral_detail}
                          </span>
                        )}
                      </td>
                      <td className={`${T.td} hidden text-right whitespace-nowrap text-slate-500 lg:table-cell`}>
                        {relative(l.created_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {rows.length ? (
            <RecordCount shown={rows.length} total={leads.length} noun="leads" />
          ) : (
            <Empty icon={Users}>No leads match these filters.</Empty>
          )}
        </Card>
      )}

      <ImportLeadsModal open={modal === 'import'} onClose={() => setModal(null)} />
      <NewLeadModal open={modal === 'new'} onClose={() => setModal(null)} />
      <ShareFormModal open={shareOpen} onClose={() => setShareOpen(false)} />
      {modal === 'assign' && (
        <LeadAssignmentModal
          open={true}
          onClose={() => setModal(null)}
          selectedLeadIds={Array.from(selectedIds)}
          onAssigned={() => {
            setSelectedIds(new Set())
            refetch()
          }}
        />
      )}
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
