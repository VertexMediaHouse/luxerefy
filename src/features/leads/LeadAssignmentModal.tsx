import { useState, useMemo, type ReactNode } from 'react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Filter,
  Layers,
  PieChart,
  Repeat,
  UserCheck,
  UserMinus,
} from 'lucide-react'
import {
  Avatar,
  Button,
  ErrorText,
  Field,
  inputCls,
  Modal,
  Segmented,
  StageChip,
  Tabs,
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
  const [rrPoolType, setRrPoolType] = useState<'selected' | 'unassigned'>(selectedLeadIds.length ? 'selected' : 'unassigned')

  // For Quota Distribution
  const [quotas, setQuotas] = useState<Record<string, number>>({})
  const [quotaPoolType, setQuotaPoolType] = useState<'selected' | 'unassigned'>(selectedLeadIds.length ? 'selected' : 'unassigned')

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
    await refresh(['leads', 'lead_activities']).catch(() => {})
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
  const unassignedCount = db.leads.filter(l => !l.assigned_to).length
  const poolSize = (p: 'selected' | 'unassigned') => (p === 'selected' ? selectedLeadIds.length : unassignedCount)
  const quotaTotal = Object.values(quotas).reduce((s, q) => s + (q || 0), 0)
  const n = selectedLeadIds.length
  const plural = (k: number) => `${k} lead${k === 1 ? '' : 's'}`
  const pick = (id: string) => {
    setSelectedRepId(id)
    setError('')
  }
  const poolItems = [
    ...(n ? [{ value: 'selected' as const, label: `Selected (${n})` }] : []),
    { value: 'unassigned' as const, label: `All unassigned (${unassignedCount})` },
  ]

  return (
    <Modal open={open} onClose={onClose} title="Assign leads" wide>
      <div className="-mx-5 -mt-2 border-b border-slate-100 px-5">
        <Tabs
          value={tab}
          onChange={t => {
            setTab(t)
            setError('')
            setSuccessMsg('')
          }}
          items={METHODS.map(m => ({ value: m.key, label: m.label, icon: m.icon }))}
        />
      </div>
      <p className="mt-3 mb-4 text-xs text-slate-500">{METHODS.find(m => m.key === tab)?.hint}</p>

      {successMsg && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200">
          <CheckCircle2 className="size-4 text-emerald-600" /> {successMsg}
        </div>
      )}

      {tab === 'manual' && (
        <div className="space-y-4">
          {n ? (
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-3.5 py-3 ring-1 ring-slate-200/70">
              <div className="flex -space-x-2">
                {selectedLeads.slice(0, 4).map(l => (
                  <Avatar key={l.id} name={nameOf(l)} size="sm" className="ring-2 ring-white" />
                ))}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900">{plural(n)} selected</div>
                <div className="truncate text-xs text-slate-500">
                  {selectedLeads.slice(0, 3).map(nameOf).join(', ')}
                  {n > 3 && ` +${n - 3} more`}
                </div>
              </div>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
              No leads selected. Tick leads in the table first, or use another method.
            </p>
          )}

          <Section label="Assign to">
            <RepList reps={activeReps} isSelected={id => selectedRepId === id} onPick={pick} allowUnassign />
          </Section>

          {conflicts.length > 0 && selectedRepId && (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <span className="flex-1">
                <b>{plural(conflicts.length)}</b> already {conflicts.length === 1 ? 'has' : 'have'} an owner. Transfer
                {conflicts.length === 1 ? ' it' : ' them'} anyway?
              </span>
              <input
                type="checkbox"
                checked={overrideConflict}
                onChange={e => setOverrideConflict(e.target.checked)}
                className="mt-0.5 size-4 rounded accent-amber-600"
              />
            </label>
          )}

          <ErrorText error={error} />
          <Footer
            onCancel={onClose}
            onSubmit={handleManualSubmit}
            busy={busy}
            disabled={!n || !selectedRepId}
            label={busy ? 'Assigning…' : selectedRepId === 'unassigned' ? `Unassign ${plural(n)}` : `Assign ${plural(n)}`}
          />
        </div>
      )}

      {tab === 'group' && (
        <div className="space-y-4">
          <Section label="Group">
            <select value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)} className={inputCls}>
              <option value="">Choose a project, locality or referral list</option>
              {availableGroups.map(g => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            {selectedGroup && (
              <p className="mt-1.5 text-xs text-slate-500">{plural(groupMatchedLeads.length)} in this group</p>
            )}
          </Section>

          <Section label="Assign to">
            <RepList reps={activeReps} isSelected={id => selectedRepId === id} onPick={pick} />
          </Section>

          <ErrorText error={error} />
          <Footer
            onCancel={onClose}
            onSubmit={handleGroupSubmit}
            busy={busy}
            disabled={!selectedGroup || !groupMatchedLeads.length || !selectedRepId}
            label={busy ? 'Assigning…' : `Assign ${plural(groupMatchedLeads.length)}`}
          />
        </div>
      )}

      {tab === 'filter' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Source">
              <select value={filterSource} onChange={e => setFilterSource(e.target.value)} className={inputCls}>
                <option value="">All sources</option>
                {Object.entries(SOURCE_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Stage">
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={inputCls}>
                <option value="">All stages</option>
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

          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={filterUnassignedOnly}
              onChange={e => setFilterUnassignedOnly(e.target.checked)}
              className="size-4 rounded accent-blue-600"
            />
            Only unassigned leads
          </label>

          <div className="rounded-xl ring-1 ring-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2 text-xs">
              <span className="font-medium text-slate-700">Matches</span>
              <span className="font-semibold text-slate-900">{filterMatchedLeads.length}</span>
            </div>
            {filterMatchedLeads.length ? (
              <div className="divide-y divide-slate-100">
                {filterMatchedLeads.slice(0, 4).map(l => (
                  <div key={l.id} className="flex items-center justify-between gap-2 px-3.5 py-2 text-xs">
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar name={nameOf(l)} size="xs" />
                      <span className="truncate font-medium text-slate-900">{nameOf(l)}</span>
                      <span className="text-slate-400">{SOURCE_LABEL[l.source]}</span>
                    </div>
                    <StageChip status={l.status} />
                  </div>
                ))}
                {filterMatchedLeads.length > 4 && (
                  <p className="px-3.5 py-2 text-center text-[11px] text-slate-400">
                    +{filterMatchedLeads.length - 4} more
                  </p>
                )}
              </div>
            ) : (
              <p className="px-3.5 py-3 text-center text-xs text-slate-400">No leads match these filters.</p>
            )}
          </div>

          <Section label="Assign to">
            <RepList reps={activeReps} isSelected={id => selectedRepId === id} onPick={pick} />
          </Section>

          <ErrorText error={error} />
          <Footer
            onCancel={onClose}
            onSubmit={handleFilterSubmit}
            busy={busy}
            disabled={!filterMatchedLeads.length || !selectedRepId}
            label={busy ? 'Assigning…' : `Assign ${plural(filterMatchedLeads.length)}`}
          />
        </div>
      )}

      {tab === 'round_robin' && (
        <div className="space-y-4">
          <Section label="Leads to distribute">
            <Segmented label="Lead pool" value={rrPoolType} onChange={setRrPoolType} items={poolItems} />
          </Section>

          <Section
            label="Reps in rotation"
            aside={
              rrParticipantIds.length > 1
                ? `≈ ${Math.round(poolSize(rrPoolType) / rrParticipantIds.length)} each`
                : 'Pick at least 2'
            }
          >
            <RepList
              reps={activeReps}
              multi
              isSelected={id => rrParticipantIds.includes(id)}
              onPick={id =>
                setRrParticipantIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
              }
            />
          </Section>

          <ErrorText error={error} />
          <Footer
            onCancel={onClose}
            onSubmit={handleRoundRobinSubmit}
            busy={busy}
            disabled={rrParticipantIds.length < 2 || !poolSize(rrPoolType)}
            label={busy ? 'Distributing…' : `Distribute ${plural(poolSize(rrPoolType))}`}
          />
        </div>
      )}

      {tab === 'quota' && (
        <div className="space-y-4">
          <Section label="Leads to distribute">
            <Segmented label="Lead pool" value={quotaPoolType} onChange={setQuotaPoolType} items={poolItems} />
          </Section>

          <Section
            label="Leads per rep"
            aside={
              <span className={quotaTotal > poolSize(quotaPoolType) ? 'text-red-600' : ''}>
                {quotaTotal} / {poolSize(quotaPoolType)} allocated
              </span>
            }
          >
            <div className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-xl ring-1 ring-slate-200">
              {activeReps.map(r => (
                <div key={r.id} className="flex items-center gap-3 px-3.5 py-2.5">
                  <Avatar name={r.full_name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-900">{r.full_name}</div>
                    <div className="text-xs text-slate-500">{r.assigned_leads_count} leads now</div>
                  </div>
                  <input
                    type="number"
                    min="0"
                    value={quotas[r.id] || ''}
                    onChange={e => setQuotas(q => ({ ...q, [r.id]: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                    placeholder="0"
                    aria-label={`Quota for ${r.full_name}`}
                    className="w-20 rounded-lg border border-slate-200 px-2.5 py-1.5 text-right text-sm font-medium focus:border-blue-500 focus:outline-none"
                  />
                </div>
              ))}
            </div>
          </Section>

          <ErrorText error={error} />
          <Footer
            onCancel={onClose}
            onSubmit={handleQuotaSubmit}
            busy={busy}
            disabled={!quotaTotal || quotaTotal > poolSize(quotaPoolType)}
            label={busy ? 'Distributing…' : `Distribute ${plural(quotaTotal)}`}
          />
        </div>
      )}
    </Modal>
  )
}

const METHODS: { key: MethodTab; label: string; icon: typeof UserCheck; hint: string }[] = [
  { key: 'manual', label: 'Manual', icon: UserCheck, hint: 'Give the leads you ticked to one rep.' },
  { key: 'group', label: 'Group', icon: Layers, hint: 'Hand a whole project, locality or referral list to one rep.' },
  { key: 'filter', label: 'Filter', icon: Filter, hint: 'Match leads by source, stage or city, then assign them all.' },
  { key: 'round_robin', label: 'Round-robin', icon: Repeat, hint: 'Rotate leads evenly across several reps.' },
  { key: 'quota', label: 'Quota', icon: PieChart, hint: 'Set how many leads each rep gets.' },
]

const nameOf = (l: Lead) => db.contacts.find(c => c.id === l.contact_id)?.name ?? 'Lead'

function Section({ label, aside, children }: { label: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-medium text-slate-700">{label}</span>
        {aside && <span className="text-slate-500">{aside}</span>}
      </div>
      {children}
    </div>
  )
}

type Rep = { id: string; full_name: string; email: string; assigned_leads_count: number }

/** Rep picker: one row per rep with current workload. Radio by default, checkboxes when `multi`. */
function RepList({
  reps,
  isSelected,
  onPick,
  multi,
  allowUnassign,
}: {
  reps: Rep[]
  isSelected: (id: string) => boolean
  onPick: (id: string) => void
  multi?: boolean
  allowUnassign?: boolean
}) {
  if (!reps.length)
    return (
      <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
        No active sales reps yet.
      </p>
    )
  const max = Math.max(1, ...reps.map(r => r.assigned_leads_count))
  const row = (id: string, avatar: ReactNode, name: string, sub: string, load?: number) => {
    const sel = isSelected(id)
    return (
      <button
        key={id}
        type="button"
        role={multi ? 'checkbox' : 'radio'}
        aria-checked={sel}
        onClick={() => onPick(id)}
        className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${sel ? 'bg-blue-50/70' : 'hover:bg-slate-50'}`}
      >
        {avatar}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-slate-900">{name}</div>
          <div className="truncate text-xs text-slate-500">{sub}</div>
        </div>
        {load !== undefined && (
          <div className="hidden w-24 shrink-0 sm:block">
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-slate-400" style={{ width: `${(load / max) * 100}%` }} />
            </div>
            <div className="mt-1 text-right text-[11px] text-slate-500">{load} leads</div>
          </div>
        )}
        <span
          className={`flex size-5 shrink-0 items-center justify-center border ${multi ? 'rounded-md' : 'rounded-full'} ${sel ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white'}`}
        >
          {sel && <Check className="size-3.5" strokeWidth={3} />}
        </span>
      </button>
    )
  }
  return (
    <div
      role={multi ? 'group' : 'radiogroup'}
      className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-xl ring-1 ring-slate-200"
    >
      {allowUnassign &&
        row(
          'unassigned',
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <UserMinus className="size-4" />
          </span>,
          'Unassign',
          'Remove the current owner',
        )}
      {reps.map(r => row(r.id, <Avatar name={r.full_name} size="sm" />, r.full_name, r.email, r.assigned_leads_count))}
    </div>
  )
}

function Footer({
  onCancel,
  onSubmit,
  busy,
  disabled,
  label,
}: {
  onCancel: () => void
  onSubmit: () => void
  busy: boolean
  disabled: boolean
  label: string
}) {
  return (
    <div className="-mx-5 -mb-5 mt-5 flex justify-end gap-2 rounded-b-xl border-t border-slate-100 bg-slate-50/60 px-5 py-3">
      <Button variant="secondary" onClick={onCancel} disabled={busy}>
        Cancel
      </Button>
      <Button onClick={onSubmit} disabled={busy || disabled}>
        {label}
      </Button>
    </div>
  )
}
