import { useState, useMemo } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Filter,
  Layers,
  PieChart,
  Repeat,
  Sparkles,
  UserCheck,
} from 'lucide-react'
import {
  Avatar,
  Badge,
  Button,
  ErrorText,
  Field,
  inputCls,
  Modal,
  StageChip,
} from '../../components/ui'
import { db, ok, refresh } from '../../lib/db'
import { supabase } from '../../lib/supabase'
import { SOURCE_LABEL } from '../../lib/labels'
import { stagesOf } from '../../lib/stages'
import type { AssignmentMethod, Lead } from '../../lib/types'
import { useSalesUsers } from '../sales-team/api'

type MethodTab = 'manual' | 'group' | 'filter' | 'round_robin' | 'quota'

export function LeadAssignmentModal({
  open,
  onClose,
  selectedLeadIds = [],
  onAssigned,
}: {
  open: boolean
  onClose: () => void
  selectedLeadIds?: string[]
  onAssigned?: () => void
}) {
  const activeReps = useSalesUsers().data?.filter(u => u.active && u.is_sales) || []

  const [tab, setTab] = useState<MethodTab>(selectedLeadIds.length > 0 ? 'manual' : 'round_robin')
  const [selectedRepId, setSelectedRepId] = useState<string>('')
  const [overrideConflict, setOverrideConflict] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // For Group Assignment
  const [selectedGroup, setSelectedGroup] = useState<string>('')

  // For Filter Assignment
  const [filterSource, setFilterSource] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterCity, setFilterCity] = useState<string>('')
  const [filterUnassignedOnly, setFilterUnassignedOnly] = useState(false)

  // For Round-Robin
  const [rrParticipantIds, setRrParticipantIds] = useState<string[]>([])
  const [rrPoolType, setRrPoolType] = useState<'selected' | 'unassigned'>('selected')

  // For Quota Distribution
  const [quotas, setQuotas] = useState<Record<string, number>>({})
  const [quotaPoolType, setQuotaPoolType] = useState<'selected' | 'unassigned'>('selected')

  // Available groups/tags derived from lead records
  const availableGroups = useMemo(() => {
    const set = new Set<string>()
    db.leads.forEach(l => {
      if (l.referral_detail) set.add(l.referral_detail)
      if (l.project) set.add(`Project: ${l.project}`)
      if (l.locality) set.add(`Locality: ${l.locality}`)
    })
    return Array.from(set)
  }, [])

  // Identify conflicts among selected leads
  const selectedLeads = useMemo(
    () => db.leads.filter(l => selectedLeadIds.includes(l.id)),
    [selectedLeadIds],
  )

  const conflicts = useMemo(
    () => selectedLeads.filter(l => l.assigned_to && l.assigned_to !== selectedRepId),
    [selectedLeads, selectedRepId],
  )

  // Filter-matched leads
  const filterMatchedLeads = useMemo(() => {
    return db.leads.filter(l => {
      if (filterSource && l.source !== filterSource) return false
      if (filterStatus && l.status !== filterStatus) return false
      if (filterCity && (l.city || '').toLowerCase() !== filterCity.toLowerCase()) return false
      if (filterUnassignedOnly && l.assigned_to) return false
      return true
    })
  }, [filterSource, filterStatus, filterCity, filterUnassignedOnly])

  // Group-matched leads
  const groupMatchedLeads = useMemo(() => {
    if (!selectedGroup) return []
    return db.leads.filter(l => {
      const matchProject = selectedGroup.startsWith('Project: ') && l.project === selectedGroup.replace('Project: ', '')
      const matchLocality = selectedGroup.startsWith('Locality: ') && l.locality === selectedGroup.replace('Locality: ', '')
      const matchRef = l.referral_detail === selectedGroup
      return matchProject || matchLocality || matchRef
    })
  }, [selectedGroup])

  // One assign_leads() call per action: the database checks the caller is a manager and that
  // every target is an active sales user, then moves all leads or none.
  const executeAssignment = async (pairs: { lead_id: string; assigned_to: string | null }[], method: AssignmentMethod) => {
    ok(await supabase.rpc('assign_leads', { p_assignments: pairs, p_method: method }))
    await refresh().catch(() => {})
  }
  const toOne = (leadIds: string[], rep: string | null) => leadIds.map(lead_id => ({ lead_id, assigned_to: rep }))

  // 1. Submit Manual
  const handleManualSubmit = async () => {
    if (!selectedRepId) {
      setError('Please select a sales representative or choose Unassign.')
      return
    }
    if (conflicts.length > 0 && !overrideConflict) {
      setError('Some leads are already assigned. Check "Override existing assignments" to proceed.')
      return
    }

    setBusy(true)
    setError('')
    try {
      const targetRep = selectedRepId === 'unassigned' ? null : selectedRepId
      await executeAssignment(toOne(selectedLeadIds, targetRep), 'manual')
      setSuccessMsg(`Successfully assigned ${selectedLeadIds.length} lead(s).`)
      setTimeout(() => {
        onAssigned?.()
        onClose()
      }, 1000)
    } catch (err: any) {
      setError(err.message || 'Assignment failed')
    } finally {
      setBusy(false)
    }
  }

  // 2. Submit Group
  const handleGroupSubmit = async () => {
    if (!selectedGroup) {
      setError('Please choose a lead group or campaign.')
      return
    }
    if (!selectedRepId) {
      setError('Please select a destination sales representative.')
      return
    }
    const leadIds = groupMatchedLeads.map(l => l.id)
    if (leadIds.length === 0) {
      setError('No leads found in this group.')
      return
    }

    setBusy(true)
    setError('')
    try {
      const targetRep = selectedRepId === 'unassigned' ? null : selectedRepId
      await executeAssignment(toOne(leadIds, targetRep), 'group')
      setSuccessMsg(`Successfully assigned ${leadIds.length} lead(s) from "${selectedGroup}".`)
      setTimeout(() => {
        onAssigned?.()
        onClose()
      }, 1000)
    } catch (err: any) {
      setError(err.message || 'Assignment failed')
    } finally {
      setBusy(false)
    }
  }

  // 3. Submit Filter
  const handleFilterSubmit = async () => {
    if (!selectedRepId) {
      setError('Please select a destination sales representative.')
      return
    }
    const leadIds = filterMatchedLeads.map(l => l.id)
    if (leadIds.length === 0) {
      setError('No leads match the selected filters.')
      return
    }

    setBusy(true)
    setError('')
    try {
      const targetRep = selectedRepId === 'unassigned' ? null : selectedRepId
      await executeAssignment(toOne(leadIds, targetRep), 'filter')
      setSuccessMsg(`Successfully assigned ${leadIds.length} matching lead(s).`)
      setTimeout(() => {
        onAssigned?.()
        onClose()
      }, 1000)
    } catch (err: any) {
      setError(err.message || 'Assignment failed')
    } finally {
      setBusy(false)
    }
  }

  // 4. Submit Round-Robin
  const handleRoundRobinSubmit = async () => {
    if (rrParticipantIds.length < 2) {
      setError('Please select at least 2 sales representatives for round-robin distribution.')
      return
    }
    let pool: Lead[] = []
    if (rrPoolType === 'selected') pool = selectedLeads
    else pool = db.leads.filter(l => !l.assigned_to)

    if (pool.length === 0) {
      setError('Lead pool is empty.')
      return
    }

    setBusy(true)
    setError('')
    try {
      await executeAssignment(
        pool.map((l, i) => ({ lead_id: l.id, assigned_to: rrParticipantIds[i % rrParticipantIds.length] })),
        'round_robin',
      )

      setSuccessMsg(`Distributed ${pool.length} leads across ${rrParticipantIds.length} sales reps!`)
      setTimeout(() => {
        onAssigned?.()
        onClose()
      }, 1000)
    } catch (err: any) {
      setError(err.message || 'Distribution failed')
    } finally {
      setBusy(false)
    }
  }

  // 5. Submit Quota-based
  const handleQuotaSubmit = async () => {
    let pool: Lead[] = []
    if (quotaPoolType === 'selected') pool = selectedLeads
    else pool = db.leads.filter(l => !l.assigned_to)

    const totalRequested = Object.values(quotas).reduce((sum, q) => sum + (q || 0), 0)
    if (totalRequested <= 0) {
      setError('Please enter a quota of at least 1 lead for one or more representatives.')
      return
    }
    if (totalRequested > pool.length) {
      setError(`Total quota (${totalRequested}) exceeds available lead pool (${pool.length}).`)
      return
    }

    setBusy(true)
    setError('')
    try {
      const reps = Object.entries(quotas).flatMap(([repId, n]) => Array<string>(n || 0).fill(repId))
      await executeAssignment(pool.slice(0, reps.length).map((l, i) => ({ lead_id: l.id, assigned_to: reps[i] })), 'quota')

      setSuccessMsg(`Successfully allocated ${totalRequested} leads according to quotas!`)
      setTimeout(() => {
        onAssigned?.()
        onClose()
      }, 1000)
    } catch (err: any) {
      setError(err.message || 'Quota assignment failed')
    } finally {
      setBusy(false)
    }
  }

  const allStages = stagesOf('pl-1')

  return (
    <Modal open={open} onClose={onClose} title="Lead Assignment & Distribution" wide>
      {/* 5-Tab Selector */}
      <div className="mb-5 flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        {[
          { key: 'manual', label: 'Manual Selection', icon: UserCheck },
          { key: 'group', label: 'Group / List', icon: Layers },
          { key: 'filter', label: 'Filter-Based', icon: Filter },
          { key: 'round_robin', label: 'Round-Robin', icon: Repeat },
          { key: 'quota', label: 'Quota-Based', icon: PieChart },
        ].map(m => {
          const Icon = m.icon
          const active = tab === m.key
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => {
                setTab(m.key as MethodTab)
                setError('')
                setSuccessMsg('')
              }}
              className={`flex flex-1 min-w-32 items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition-all ${
                active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Icon className={`size-3.5 ${active ? 'text-blue-600' : ''}`} />
              {m.label}
            </button>
          )
        })}
      </div>

      {successMsg && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200">
          <CheckCircle2 className="size-4 text-emerald-600" /> {successMsg}
        </div>
      )}

      {/* Tab 1: Manual Selection */}
      {tab === 'manual' && (
        <div className="space-y-4">
          <div className="rounded-lg bg-blue-50/60 border border-blue-100 p-3 text-xs text-blue-900 flex items-center justify-between">
            <span>
              <b>{selectedLeadIds.length} lead(s)</b> currently selected for assignment.
            </span>
            <span className="text-[11px] text-blue-700">Method: Direct Manual Allocation</span>
          </div>

          <Field label="Assign Selected Leads To:">
            <select
              value={selectedRepId}
              onChange={e => setSelectedRepId(e.target.value)}
              className={inputCls}
            >
              <option value="">-- Choose Sales Representative --</option>
              <option value="unassigned">-- Unassign (Remove Owner) --</option>
              {activeReps.map(r => (
                <option key={r.id} value={r.id}>
                  {r.full_name} ({r.email}) • {r.assigned_leads_count} currently assigned
                </option>
              ))}
            </select>
          </Field>

          {/* Conflict warning */}
          {conflicts.length > 0 && selectedRepId && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900">
              <div className="flex items-start gap-2">
                <AlertTriangle className="size-4 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <b>Conflicting Assignment Warning:</b>
                  <p className="mt-0.5">
                    {conflicts.length} of the selected leads are already assigned to other reps.
                  </p>
                  <label className="mt-2.5 flex items-center gap-2 cursor-pointer font-semibold text-amber-950">
                    <input
                      type="checkbox"
                      checked={overrideConflict}
                      onChange={e => setOverrideConflict(e.target.checked)}
                      className="size-4 accent-amber-600 rounded"
                    />
                    Override existing assignments and transfer ownership to chosen rep
                  </label>
                </div>
              </div>
            </div>
          )}

          <ErrorText error={error} />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={handleManualSubmit} disabled={busy || selectedLeadIds.length === 0}>
              {busy ? 'Assigning…' : `Assign ${selectedLeadIds.length} Leads`}
            </Button>
          </div>
        </div>
      )}

      {/* Tab 2: Group / List / Campaign Assignment */}
      {tab === 'group' && (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Assign an entire lead list, marketing campaign, project inquiry pool, or tag to a sales representative in one click.
          </p>

          <Field label="Select Lead Group / Campaign / List:">
            <select
              value={selectedGroup}
              onChange={e => setSelectedGroup(e.target.value)}
              className={inputCls}
            >
              <option value="">-- Select a group / campaign --</option>
              {availableGroups.map(g => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </Field>

          {selectedGroup && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs">
              <div className="flex items-center justify-between font-medium text-slate-900">
                <span>Matching Leads in "{selectedGroup}":</span>
                <Badge tone="blue">{groupMatchedLeads.length} leads</Badge>
              </div>
            </div>
          )}

          <Field label="Assign Entire Group To:">
            <select
              value={selectedRepId}
              onChange={e => setSelectedRepId(e.target.value)}
              className={inputCls}
            >
              <option value="">-- Choose Sales Representative --</option>
              {activeReps.map(r => (
                <option key={r.id} value={r.id}>
                  {r.full_name} ({r.assigned_leads_count} current)
                </option>
              ))}
            </select>
          </Field>

          <ErrorText error={error} />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={handleGroupSubmit}
              disabled={busy || !selectedGroup || groupMatchedLeads.length === 0}
            >
              {busy ? 'Assigning Group…' : `Assign All ${groupMatchedLeads.length} Leads`}
            </Button>
          </div>
        </div>
      )}

      {/* Tab 3: Filter-Based Bulk Assignment */}
      {tab === 'filter' && (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Filter leads by source, status, or location, review matching count, and assign all matching leads in bulk.
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Lead Source">
              <select
                value={filterSource}
                onChange={e => setFilterSource(e.target.value)}
                className={inputCls}
              >
                <option value="">All Sources</option>
                {Object.entries(SOURCE_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Stage / Status">
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className={inputCls}
              >
                <option value="">All Stages</option>
                {allStages.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="City">
              <input
                value={filterCity}
                onChange={e => setFilterCity(e.target.value)}
                placeholder="e.g. Ahmedabad"
                className={inputCls}
              />
            </Field>
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={filterUnassignedOnly}
              onChange={e => setFilterUnassignedOnly(e.target.checked)}
              className="size-4 rounded accent-blue-600"
            />
            Match only unassigned leads (do not reassign already assigned ones)
          </label>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
              <span>Matching Leads Preview:</span>
              <span className="text-blue-600">{filterMatchedLeads.length} total matches</span>
            </div>
            {filterMatchedLeads.length > 0 && (
              <div className="mt-2 divide-y divide-slate-100 max-h-36 overflow-y-auto pr-1">
                {filterMatchedLeads.slice(0, 5).map(l => {
                  const c = db.contacts.find(con => con.id === l.contact_id)
                  return (
                    <div key={l.id} className="py-1.5 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-medium text-slate-900">{c?.name || 'Lead'}</span>
                        <span className="ml-2 text-slate-400">({l.source})</span>
                      </div>
                      <StageChip status={l.status} />
                    </div>
                  )
                })}
              </div>
            )}
            {filterMatchedLeads.length > 5 && (
              <p className="mt-1 text-[11px] text-slate-400 text-center">
                + {filterMatchedLeads.length - 5} more matching leads
              </p>
            )}
          </div>

          <Field label="Assign All Filtered Leads To:">
            <select
              value={selectedRepId}
              onChange={e => setSelectedRepId(e.target.value)}
              className={inputCls}
            >
              <option value="">-- Choose Sales Representative --</option>
              {activeReps.map(r => (
                <option key={r.id} value={r.id}>
                  {r.full_name} ({r.assigned_leads_count} currently assigned)
                </option>
              ))}
            </select>
          </Field>

          <ErrorText error={error} />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={handleFilterSubmit}
              disabled={busy || filterMatchedLeads.length === 0}
            >
              {busy ? 'Assigning…' : `Confirm & Assign ${filterMatchedLeads.length} Leads`}
            </Button>
          </div>
        </div>
      )}

      {/* Tab 4: Round-Robin Distribution */}
      {tab === 'round_robin' && (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Auto-distribute leads in equal round-robin rotation across multiple selected sales representatives.
          </p>

          <Field label="Source Pool:">
            <select
              value={rrPoolType}
              onChange={e => setRrPoolType(e.target.value as any)}
              className={inputCls}
            >
              {selectedLeadIds.length > 0 && (
                <option value="selected">Currently Selected Leads ({selectedLeadIds.length})</option>
              )}
              <option value="unassigned">All Unassigned Leads ({db.leads.filter(l => !l.assigned_to).length})</option>
            </select>
          </Field>

          <div>
            <span className="mb-2 block text-xs font-semibold text-slate-700">
              Select Participating Sales Representatives (at least 2):
            </span>
            <div className="grid gap-2 sm:grid-cols-2 max-h-48 overflow-y-auto">
              {activeReps.map(r => {
                const selected = rrParticipantIds.includes(r.id)
                return (
                  <label
                    key={r.id}
                    className={`flex items-center gap-3 rounded-lg border p-2.5 cursor-pointer text-xs transition-colors ${
                      selected ? 'border-blue-500 bg-blue-50/40 text-blue-900' : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={e => {
                        if (e.target.checked) setRrParticipantIds(prev => [...prev, r.id])
                        else setRrParticipantIds(prev => prev.filter(id => id !== r.id))
                      }}
                      className="size-4 accent-blue-600 rounded"
                    />
                    <Avatar name={r.full_name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate">{r.full_name}</div>
                      <div className="text-[11px] text-slate-400">{r.assigned_leads_count} current leads</div>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          {rrParticipantIds.length > 1 && (
            <div className="rounded-xl bg-blue-50 p-3 text-xs text-blue-900 border border-blue-100 flex items-center justify-between">
              <div>
                <span className="font-semibold">Distribution Preview:</span>
                <p className="mt-0.5 text-blue-700">
                  Leads will be assigned in balanced rotation (~
                  {Math.round(
                    (rrPoolType === 'selected'
                      ? selectedLeadIds.length
                      : rrPoolType === 'unassigned'
                        ? db.leads.filter(l => !l.assigned_to).length
                        : db.leads.length) / rrParticipantIds.length,
                  )}{' '}
                  leads each).
                </p>
              </div>
              <Sparkles className="size-5 text-blue-600 shrink-0" />
            </div>
          )}

          <ErrorText error={error} />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={handleRoundRobinSubmit} disabled={busy || rrParticipantIds.length < 2}>
              {busy ? 'Distributing…' : 'Execute Round-Robin'}
            </Button>
          </div>
        </div>
      )}

      {/* Tab 5: Quota-Based Distribution */}
      {tab === 'quota' && (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Set custom assignment numbers per representative (e.g. Senior Rep: 40, Junior Rep: 20) and distribute from the pool.
          </p>

          <Field label="Source Pool to Draw From:">
            <select
              value={quotaPoolType}
              onChange={e => setQuotaPoolType(e.target.value as any)}
              className={inputCls}
            >
              {selectedLeadIds.length > 0 && (
                <option value="selected">Currently Selected Leads ({selectedLeadIds.length})</option>
              )}
              <option value="unassigned">All Unassigned Leads ({db.leads.filter(l => !l.assigned_to).length})</option>
            </select>
          </Field>

          <div className="space-y-2">
            <span className="block text-xs font-semibold text-slate-700">Specify Lead Quota per Rep:</span>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {activeReps.map(r => (
                <div key={r.id} className="flex items-center justify-between p-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={r.full_name} size="sm" />
                    <div>
                      <div className="font-semibold text-slate-900">{r.full_name}</div>
                      <div className="text-[11px] text-slate-400">{r.assigned_leads_count} currently assigned</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-xs">Quota:</span>
                    <input
                      type="number"
                      min="0"
                      value={quotas[r.id] ?? ''}
                      onChange={e => {
                        const val = parseInt(e.target.value, 10) || 0
                        setQuotas(q => ({ ...q, [r.id]: val }))
                      }}
                      placeholder="0"
                      className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-right text-xs font-semibold"
                    />
                    <span className="text-slate-400 text-xs">leads</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <ErrorText error={error} />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={handleQuotaSubmit} disabled={busy}>
              {busy ? 'Distributing…' : 'Apply Quotas & Distribute'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
