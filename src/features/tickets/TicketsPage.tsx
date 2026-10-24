import { useState, type FormEvent } from 'react'
import { CheckCircle2, Headphones, LifeBuoy, Plus } from 'lucide-react'
import { Badge, Button, Card, Empty, ErrorText, Field, inputCls, Loading, Modal, PageHeader, RecordCount, T, Tabs, Toolbar } from '../../components/ui'
import { TICKET_STATUS_LABEL, TICKET_STATUS_TONE } from '../../lib/labels'
import { dateTime, relative } from '../../lib/format'
import type { TicketStatus } from '../../lib/types'
import { useCreateTicket, useTickets, useUpdateTicket, type TicketRow } from './api'

export const ticketNo = (n: number) => `#TK-${String(n).padStart(3, '0')}`

export function TicketsPage() {
  const { data } = useTickets()
  const [tab, setTab] = useState<TicketStatus | 'all'>('all')
  const [raising, setRaising] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  if (!data) return <Loading />

  const rows = tab === 'all' ? data : data.filter(t => t.status === tab)
  const open = data.find(t => t.id === openId)

  return (
    <>
      <PageHeader
        icon={LifeBuoy}
        title="Tickets"
        subtitle="Raise issues or support requests and track them through resolution"
        actions={
          <Button onClick={() => setRaising(true)}>
            <Plus className="size-4" /> Raise ticket
          </Button>
        }
      />

      <Card>
        <Toolbar>
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { value: 'all', label: 'All', count: data.length },
              ...(['pending', 'in_progress', 'resolved'] as const).map(s => ({
                value: s,
                label: TICKET_STATUS_LABEL[s],
                count: data.filter(t => t.status === s).length,
              })),
            ]}
          />
        </Toolbar>
        <div className="overflow-x-auto">
          <table className={T.table}>
            <thead className={T.head}>
              <tr>
                <th className={`${T.th} hidden sm:table-cell`}>Number</th>
                <th className={T.th}>Subject</th>
                <th className={T.th}>Status</th>
                <th className={`${T.th} hidden md:table-cell`}>Date Raised</th>
              </tr>
            </thead>
            <tbody className={T.body}>
              {rows.map(t => (
                <tr key={t.id} onClick={() => setOpenId(t.id)} className={T.row}>
                  <td className={`${T.td} hidden font-medium whitespace-nowrap text-slate-500 sm:table-cell`}>
                    {ticketNo(t.number)}
                  </td>
                  <td className={T.td}>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation()
                        setOpenId(t.id)
                      }}
                      className="block max-w-[32rem] truncate text-left font-semibold text-slate-900 hover:text-blue-700 hover:underline"
                    >
                      {t.title}
                    </button>
                    <span className="block max-w-[32rem] truncate text-xs text-slate-500">
                      {t.description || 'No description provided'}
                    </span>
                  </td>
                  <td className={T.td}>
                    <Badge tone={TICKET_STATUS_TONE[t.status]}>{TICKET_STATUS_LABEL[t.status]}</Badge>
                  </td>
                  <td className={`${T.td} hidden whitespace-nowrap text-xs text-slate-500 md:table-cell`}>
                    {relative(t.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length ? (
          <RecordCount shown={rows.length} total={data.length} noun="tickets" />
        ) : (
          <Empty icon={LifeBuoy}>No tickets here.</Empty>
        )}
      </Card>

      <Modal open={raising} onClose={() => setRaising(false)} title="Raise a ticket" wide>
        <RaiseForm onDone={() => setRaising(false)} />
      </Modal>
      <Modal open={!!open} onClose={() => setOpenId(null)} title={open ? `${ticketNo(open.number)}: ${open.title}` : ''} wide>
        {open && <TicketDetail t={open} />}
      </Modal>
    </>
  )
}

function TicketDetail({ t }: { t: TicketRow }) {
  const update = useUpdateTicket()
  const steps = [
    { at: t.created_at, label: `Raised by ${t.raised_by_name ?? 'User'}`, icon: Plus, done: true },
    { at: t.in_progress_at, label: 'Work started', icon: Headphones, done: !!t.in_progress_at },
    { at: t.resolved_at, label: 'Resolved', icon: CheckCircle2, done: !!t.resolved_at },
  ].filter(s => s.done || s.icon === Headphones || s.icon === CheckCircle2)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <Badge tone={TICKET_STATUS_TONE[t.status]}>{TICKET_STATUS_LABEL[t.status]}</Badge>
        <span className="text-xs text-slate-400">Created {dateTime(t.created_at)}</span>
      </div>

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Subject</h4>
        <p className="text-base font-semibold text-slate-900">{t.title}</p>
      </div>

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Body / Description</h4>
        <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-4">
          <p className="text-sm leading-relaxed whitespace-pre-line text-slate-800">
            {t.description || 'No description provided.'}
          </p>
        </div>
      </div>

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Activity History</h4>
        <ol className="relative space-y-0 rounded-lg bg-slate-50 p-4">
          {steps.map((s, i) => (
            <li key={s.label} className="relative flex gap-3 pb-4 last:pb-0">
              {i < steps.length - 1 && (
                <span
                  className={`absolute left-[11px] top-6 h-[calc(100%-12px)] w-0.5 ${
                    s.done ? 'bg-blue-600' : 'bg-slate-200'
                  }`}
                />
              )}
              <span
                className={`relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full ${
                  s.done ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400'
                }`}
              >
                <s.icon className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <span className={`block text-sm font-semibold ${s.done ? 'text-slate-900' : 'text-slate-400'}`}>
                  {s.label}
                </span>
                {s.done && s.at && <span className="block text-xs text-slate-500">{dateTime(s.at)}</span>}
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
        <ErrorText error={update.error} />
        {t.status === 'pending' && (
          <Button variant="secondary" onClick={() => update.mutate({ id: t.id, status: 'in_progress' })}>
            Start work
          </Button>
        )}
        {t.status !== 'resolved' && (
          <Button onClick={() => update.mutate({ id: t.id, status: 'resolved' })}>
            Mark resolved
          </Button>
        )}
        {t.status === 'resolved' && (
          <Button variant="secondary" onClick={() => update.mutate({ id: t.id, status: 'pending' })}>
            Reopen
          </Button>
        )}
      </div>
    </div>
  )
}

function RaiseForm({ onDone }: { onDone: () => void }) {
  const create = useCreateTicket()

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const title = String(f.get('title') ?? '').trim()
    const description = String(f.get('description') ?? '').trim()
    create.mutate(
      { title, description },
      { onSuccess: onDone },
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Subject *">
        <input
          name="title"
          required
          className={inputCls}
          placeholder="What is the issue or request?"
          autoFocus
        />
      </Field>
      <Field label="Body (Description) *">
        <textarea
          name="description"
          required
          rows={5}
          className={inputCls}
          placeholder="Describe the issue or details here..."
        />
      </Field>
      <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
        <ErrorText error={create.error} />
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={create.isPending}>
          Raise ticket
        </Button>
      </div>
    </form>
  )
}
