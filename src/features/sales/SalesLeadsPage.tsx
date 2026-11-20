import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { NewLeadModal } from '../leads/LeadModals'
import { LeadBoard } from '../leads/LeadBoard'
import {
  ChevronLeft,
  ChevronRight,
  Link2,
  MessageCircle,
  Plus,
  Phone,
  Users,
  KanbanSquare,
  List,
} from 'lucide-react'
import {
  Avatar,
  Button,
  Card,
  Empty,
  inlineInputCls,
  PageHeader,
  Segmented,
  SearchBox,
  StageChip,
  T,
  Tabs,
} from '../../components/ui'
import { useUser } from '../../lib/session'
import { useLeads } from '../leads/api'
import { db } from '../../lib/db'
import { stagesOf } from '../../lib/stages'
import { SOURCE_LABEL } from '../../lib/labels'
import { budget, dateTime, prettyPhone, waLink } from '../../lib/format'
import { isOpen } from '../../lib/rules'
import { isOverdue, useTasks } from '../tasks/api'
import type { Lead, LeadStatus, Task } from '../../lib/types'

const PAGE_SIZE = 15

export function SalesLeadsPage() {
  const user = useUser()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const [adding, setAdding] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyForm = () =>
    navigator.clipboard.writeText(`${location.origin}/sales-form?agent=${user.id}`).then(() => (setCopied(true), setTimeout(() => setCopied(false), 2000)))

  const q = params.get('q') ?? ''
  const status = (params.get('status') ?? 'all') as LeadStatus | 'all'
  const source = params.get('source') ?? ''
  const sort = params.get('sort') ?? 'newest'
  const followup = params.get('followup') ?? ''
  const page = parseInt(params.get('page') ?? '1', 10)

  const set = (k: string, v: string) =>
    setParams(
      p => {
        if (v && v !== 'all') p.set(k, v)
        else p.delete(k)
        p.set('page', '1')
        return p
      },
      { replace: true },
    )

  // useLeads() re-renders this page whenever the mirror refreshes; RLS already limits a rep to their own.
  const { data: rows = [] } = useLeads()
  useTasks()
  const myLeads = db.leads.filter(l => l.assigned_to === user.id)

  // Earliest pending task per lead: what the rep owes this client next.
  const nextTask = new Map<string, Task>()
  db.tasks
    .filter(t => t.assigned_to === user.id && t.status === 'pending' && t.lead_id)
    .sort((a, b) => a.due_at.localeCompare(b.due_at))
    .forEach(t => !nextTask.has(t.lead_id!) && nextTask.set(t.lead_id!, t))
  const noFollowUp = (l: Lead) => isOpen(l) && !nextTask.has(l.id)
  const lateFollowUp = (l: Lead) => {
    const t = nextTask.get(l.id)
    return !!t && isOverdue(t)
  }
  const noneCount = myLeads.filter(noFollowUp).length
  const lateCount = myLeads.filter(lateFollowUp).length

  const stages = stagesOf('pl-1')
  const needle = q.toLowerCase().trim()

  const filtered = myLeads
      .filter(l => {
        if (status !== 'all' && l.status !== status) return false
        if (source && l.source !== source) return false
        if (followup === 'none' && !noFollowUp(l)) return false
        if (followup === 'overdue' && !lateFollowUp(l)) return false

        if (needle) {
          const contact = db.contacts.find(c => c.id === l.contact_id)
          const nameMatch = contact?.name?.toLowerCase().includes(needle)
          const phoneMatch = contact?.phone?.includes(needle.replace(/\s/g, ''))
          const interestMatch = (l.property_interest || '').toLowerCase().includes(needle)
          const notesMatch = (l.notes || '').toLowerCase().includes(needle)
          if (!nameMatch && !phoneMatch && !interestMatch && !notesMatch) return false
        }
        return true
      })
      .sort((a, b) => {
        if (sort === 'oldest') return a.created_at.localeCompare(b.created_at)
        if (sort === 'followup')
          return (nextTask.get(a.id)?.due_at ?? '￿').localeCompare(nextTask.get(b.id)?.due_at ?? '￿')
        return b.created_at.localeCompare(a.created_at)
      })

  // Pagination
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1
  const view = params.get('view') === 'board' ? 'board' : 'list'
  const ids = new Set(filtered.map(l => l.id))
  const paginatedRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <>
      <NewLeadModal open={adding} onClose={() => setAdding(false)} assignTo={user.id} base="/sales/leads" />
      <PageHeader
        icon={Users}
        title="My Leads"
        tag={
          <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
            {myLeads.length} Total Assigned
          </span>
        }
        subtitle="Leads assigned to you by management. Update pipeline stages, manage notes and follow-ups."
        actions={
          <>
            <Segmented label="Lead view" value={view} onChange={v => setParams(p => (v === 'board' ? p.set('view', 'board') : p.delete('view'), p), { replace: true })} items={[{ value: 'list', label: 'List', icon: List }, { value: 'board', label: 'Board', icon: KanbanSquare }]} />
            <Button variant="secondary" onClick={copyForm}><Link2 className="h-4 w-4" /> {copied ? 'Link copied' : 'Copy form link'}</Button>
            <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add lead</Button>
          </>
        }
      />

      {/* Filter toolbar */}
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <SearchBox
            value={q}
            onChange={v => set('q', v)}
            placeholder="Search by name, phone, or interest…"
            label="Search my leads"
            className="w-full sm:w-72"
          />

          <select
            value={source}
            onChange={e => set('source', e.target.value)}
            className={inlineInputCls}
            aria-label="Filter by source"
          >
            <option value="">All Sources</option>
            {Object.entries(SOURCE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>

          <select
            value={sort}
            onChange={e => set('sort', e.target.value)}
            className={inlineInputCls}
            aria-label="Sort leads"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="followup">Next follow-up</option>
          </select>

          {[
            { key: 'none', label: 'No follow-up', count: noneCount, on: 'bg-amber-100 text-amber-900 ring-amber-300' },
            { key: 'overdue', label: 'Overdue follow-up', count: lateCount, on: 'bg-red-100 text-red-800 ring-red-300' },
          ].map(f => (
            <button
              key={f.key}
              type="button"
              aria-pressed={followup === f.key}
              onClick={() => set('followup', followup === f.key ? '' : f.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors ${
                followup === f.key ? f.on : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300'
              }`}
            >
              {f.label} <span className="ml-0.5 font-semibold">{f.count}</span>
            </button>
          ))}

          {q || source || followup || status !== 'all' ? (
            <button
              type="button"
              onClick={() => {
                setParams(new URLSearchParams(), { replace: true })
              }}
              className="text-xs font-medium text-slate-500 hover:text-slate-800 underline"
            >
              Reset filters
            </button>
          ) : null}
        </div>
      </Card>

      {view === 'board' ? (
        <LeadBoard leads={rows.filter(r => ids.has(r.id))} base="/sales/leads" onAdd={() => setAdding(true)} />
      ) : (
      <Card>
        <div className="border-b border-slate-100 px-4 pt-2">
          <Tabs
            value={status}
            onChange={v => set('status', v)}
            items={[
              { value: 'all', label: 'All', count: myLeads.length },
              ...stages.map(s => ({
                value: s.id,
                label: s.label,
                count: myLeads.filter(l => l.status === s.id).length,
              })),
            ]}
          />
        </div>

        {paginatedRows.length === 0 ? (
          <Empty icon={Users}>
            {myLeads.length === 0
              ? 'No leads currently assigned to you. When management assigns leads, they will appear here.'
              : 'No leads match the selected filter criteria.'}
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className={T.table}>
              <thead className={T.head}>
                <tr>
                  <th className={T.th}>Lead Name</th>
                  <th className={T.th}>Stage</th>
                  <th className={`${T.th} hidden sm:table-cell`}>Interest & Location</th>
                  <th className={`${T.th} hidden md:table-cell`}>Budget</th>
                  <th className={`${T.th} hidden lg:table-cell`}>Source</th>
                  <th className={`${T.th} hidden md:table-cell`}>Next follow-up</th>
                  <th className={`${T.th} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody className={T.body}>
                {paginatedRows.map(l => {
                  const contact = db.contacts.find(c => c.id === l.contact_id)
                  const properties = l.property_ids
                    .map(id => db.properties.find(p => p.id === id))
                    .filter(Boolean)
                  const interest = properties[0]?.title ?? l.property_interest ?? '—'

                  return (
                    <tr
                      key={l.id}
                      onClick={() => nav(`/sales/leads/${l.id}`)}
                      className={T.row}
                    >
                      <td className={T.td}>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={contact?.name || 'Lead'} size="sm" />
                          <div>
                            <Link
                              to={`/sales/leads/${l.id}`}
                              onClick={e => e.stopPropagation()}
                              className="font-semibold text-slate-900 hover:underline block"
                            >
                              {contact?.name || 'Unknown'}
                            </Link>
                            <span className="text-xs text-slate-500">
                              {contact ? prettyPhone(contact.phone) : ''}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className={T.td}>
                        <StageChip status={l.status} />
                      </td>

                      <td className={`${T.td} hidden sm:table-cell`}>
                        <div className="max-w-[16rem] truncate text-slate-800 text-xs font-medium">
                          {interest}
                        </div>
                        {l.city && <div className="text-[11px] text-slate-400">{l.city}</div>}
                      </td>

                      <td className={`${T.td} hidden md:table-cell text-xs text-slate-600 font-medium whitespace-nowrap`}>
                        {budget(l.budget_min, l.budget_max)}
                      </td>

                      <td className={`${T.td} hidden lg:table-cell text-xs text-slate-600`}>
                        {SOURCE_LABEL[l.source]}
                      </td>

                      <td className={`${T.td} hidden md:table-cell text-xs whitespace-nowrap`}>
                        {(() => {
                          const t = nextTask.get(l.id)
                          if (t)
                            return (
                              <span className={isOverdue(t) ? 'font-semibold text-red-600' : 'text-slate-600'}>
                                {dateTime(t.due_at)}
                              </span>
                            )
                          return isOpen(l) ? (
                            <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700">None booked</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )
                        })()}
                      </td>

                      <td className={`${T.td} text-right`} onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {contact && (
                            <a
                              href={`tel:${contact.phone}`}
                              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-600"
                              title="Call"
                            >
                              <Phone className="size-4" />
                            </a>
                          )}
                          {contact && (
                            <a
                              href={waLink(contact.phone)}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-emerald-600"
                              title="WhatsApp"
                            >
                              <MessageCircle className="size-4" />
                            </a>
                          )}
                          <Link
                            to={`/sales/leads/${l.id}`}
                            className="rounded-md px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                          >
                            Open
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <span className="text-xs text-slate-500">
              Page {page} of {totalPages} ({filtered.length} leads)
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setParams(p => { p.set('page', String(page - 1)); return p }, { replace: true })}
                className="px-2"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="secondary"
                disabled={page >= totalPages}
                onClick={() => setParams(p => { p.set('page', String(page + 1)); return p }, { replace: true })}
                className="px-2"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
      )}
    </>
  )
}
