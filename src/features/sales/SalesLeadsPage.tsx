import { useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import {
  ChevronLeft,
  ChevronRight,
  Phone,
  Users,
} from 'lucide-react'
import {
  Avatar,
  Button,
  Card,
  Empty,
  inlineInputCls,
  PageHeader,
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
import { budget, prettyPhone, relative } from '../../lib/format'
import type { LeadStatus } from '../../lib/types'

const PAGE_SIZE = 15

export function SalesLeadsPage() {
  const user = useUser()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()

  const q = params.get('q') ?? ''
  const status = (params.get('status') ?? 'all') as LeadStatus | 'all'
  const source = params.get('source') ?? ''
  const sort = params.get('sort') ?? 'newest'
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
  useLeads()
  const myLeads = db.leads.filter(l => l.assigned_to === user.id)

  const stages = stagesOf('pl-1')
  const needle = q.toLowerCase().trim()

  const filtered = useMemo(() => {
    return myLeads
      .filter(l => {
        if (status !== 'all' && l.status !== status) return false
        if (source && l.source !== source) return false

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
        return b.created_at.localeCompare(a.created_at)
      })
  }, [myLeads, status, source, needle, sort])

  // Pagination
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1
  const paginatedRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <>
      <PageHeader
        icon={Users}
        title="My Leads"
        tag={
          <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
            {myLeads.length} Total Assigned
          </span>
        }
        subtitle="Leads assigned to you by management. Update pipeline stages, manage notes and follow-ups."
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
          </select>

          {q || source || status !== 'all' ? (
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
                  <th className={`${T.th} hidden xl:table-cell`}>Assigned</th>
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

                      <td className={`${T.td} hidden lg:table-cell text-xs text-slate-600 capitalize`}>
                        {l.source}
                      </td>

                      <td className={`${T.td} hidden xl:table-cell text-xs text-slate-400`}>
                        {relative(l.created_at)}
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
    </>
  )
}
