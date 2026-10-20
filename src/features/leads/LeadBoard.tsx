import { useState, type DragEvent } from 'react'
import { Link } from 'react-router'
import { Clock, FileText, MessageSquare, Plus } from 'lucide-react'
import { Avatar, StageIcon, TONE_HEX } from '../../components/ui'
import { SOURCE_LABEL } from '../../lib/labels'
import { defaultPipeline, stagesOf, stageTone } from '../../lib/stages'
import { budget, relative } from '../../lib/format'
import type { LeadStatus } from '../../lib/types'
import { useMoveLead, type LeadRow } from './api'

const cr = (n: number) => +(n / 1e7).toFixed(2)
/** "₹2–2.5 Cr" when both ends are in crores, else the long form. */
const shortBudget = (min: number | null, max: number | null) =>
  min && max && min >= 1e7 && max > min ? `₹${cr(min)}–${cr(max)} Cr` : budget(min, max)
/** Column totals get one decimal at most — a header is not a report. */
const sum = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(n >= 1e8 ? 0 : 1)} Cr` : n >= 1e5 ? `₹${Math.round(n / 1e5)} L` : '')

const DAY = 86400e3

function LeadCard({ l, dragging, onDrag }: { l: LeadRow; dragging: boolean; onDrag: (id: string | null) => void }) {
  const task = l.next_task
  const overdue = !!task && Date.parse(task.due_at) < Date.now()
  const idle = Math.floor((Date.now() - Date.parse(l.updated_at)) / DAY)

  return (
    <Link
      to={`/leads/${l.id}`}
      draggable
      onDragStart={e => {
        e.dataTransfer.setData('text/plain', l.id)
        e.dataTransfer.effectAllowed = 'move'
        onDrag(l.id)
      }}
      onDragEnd={() => onDrag(null)}
      className={`relative block cursor-grab overflow-hidden rounded-2xl bg-white p-3.5 pl-4 shadow-card ring-1 ring-slate-900/[0.04] transition active:cursor-grabbing ${
        dragging ? 'scale-[0.98] opacity-40' : 'hover:shadow-lift hover:ring-slate-900/[0.07]'
      }`}
    >
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: TONE_HEX[stageTone(l.status)] }} aria-hidden />

      <div className="flex items-start gap-2.5">
        <Avatar name={l.contact.name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm leading-snug font-medium text-slate-900">{l.contact.name}</p>
          <p className="truncate text-xs text-slate-400">{l.property?.title ?? l.property_interest ?? 'General enquiry'}</p>
        </div>
        <p className="shrink-0 text-right text-[13px] font-medium text-slate-800 tabular-nums">{shortBudget(l.budget_min, l.budget_max)}</p>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
        <span className="rounded bg-slate-50 px-1.5 py-0.5 font-medium text-slate-500">{SOURCE_LABEL[l.source]}</span>
        <span className="truncate">{relative(l.created_at)}</span>
        {idle >= 7 && <span className="ml-auto shrink-0 font-medium text-amber-600" title={`No change in ${idle} days`}>{idle}d idle</span>}
      </div>

      <div className="mt-3 flex items-center gap-2.5 border-t border-slate-100 pt-2.5 text-[11px] text-slate-400">
        {task ? (
          <span className={`flex min-w-0 items-center gap-1 font-medium ${overdue ? 'text-red-500' : 'text-slate-500'}`} title={task.title}>
            <Clock className="size-3 shrink-0" /> <span className="truncate">{relative(task.due_at)}</span>
          </span>
        ) : (
          <span className="text-slate-300">No follow-up</span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2.5">
          <span className="flex items-center gap-1" title={`${l.activity_count} activities`}><MessageSquare className="size-3" /> {l.activity_count}</span>
          {l.doc_count > 0 && <span className="flex items-center gap-1" title={`${l.doc_count} documents`}><FileText className="size-3" /> {l.doc_count}</span>}
          {l.agent && <span title={`Owner: ${l.agent.full_name}`}><Avatar name={l.agent.full_name} size="xs" /></span>}
        </span>
      </div>
    </Link>
  )
}

/**
 * Kanban over one pipeline's stages. `limit` caps cards per column (dashboard preview).
 * Dragging a card onto a column writes the stage change; the detail page stepper remains
 * the keyboard route, since native HTML5 drag has no keyboard equivalent.
 */
export function LeadBoard({ leads, pipelineId, limit, onAdd, visibleStages }: { leads: LeadRow[]; pipelineId?: string; limit?: number; onAdd?: () => void; visibleStages?: string[] }) {
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const move = useMoveLead()
  const pid = pipelineId ?? defaultPipeline().id
  const allStages = stagesOf(pid)
  const stages = visibleStages && visibleStages.length > 0
    ? allStages.filter(s => visibleStages.includes(s.id))
    : allStages

  const drop = (e: DragEvent, status: LeadStatus, kind: string) => {
    e.preventDefault()
    setOver(null)
    setDrag(null)
    const id = e.dataTransfer.getData('text/plain')
    if (!id || leads.find(l => l.id === id)?.status === status) return
    // ponytail: native prompt keeps the lost reason without building a drag-aware modal.
    if (kind === 'lost') {
      const reason = prompt('Why was this lead lost? (Cancel to leave it where it is)')
      if (reason === null) return
      move.mutate({ id, status, reason: reason.trim() || undefined })
      return
    }
    move.mutate({ id, status })
  }

  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-2">
      {move.isError && <p className="mb-2 text-sm text-red-600">{(move.error as Error).message}</p>}
      <div className="flex items-start gap-3.5">
        {stages.map(s => {
          const col = leads.filter(l => l.status === s.id)
          const shown = limit ? col.slice(0, limit) : col
          const value = col.reduce((v, l) => v + (l.budget_max ?? l.budget_min ?? 0), 0)
          const active = over === s.id
          return (
            <section
              key={s.id}
              aria-label={s.label}
              className="w-[16.5rem] shrink-0"
              onDragOver={e => { e.preventDefault(); setOver(s.id) }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(c => (c === s.id ? null : c)) }}
              onDrop={e => drop(e, s.id, s.kind)}
            >
              <header className="flex items-center gap-2 px-1 pb-2.5 text-sm">
                <StageIcon status={s.id} className="size-4" />
                <span className="truncate font-medium text-slate-700">{s.label}</span>
                <span className="text-slate-400 tabular-nums">{col.length}</span>
                {s.kind === 'entry' && onAdd && (
                  <button type="button" onClick={onAdd} className="ml-auto flex size-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white hover:bg-slate-700" aria-label="New lead"><Plus className="size-3.5" /></button>
                )}
                {s.kind !== 'entry' && value > 0 && <span className="ml-auto shrink-0 text-xs text-slate-400 tabular-nums">{sum(value)}</span>}
              </header>
              <div
                className={`space-y-2.5 rounded-2xl p-2 transition-colors ${
                  active ? 'bg-slate-200/70 ring-1 ring-slate-300 ring-inset' : 'bg-slate-100/70'
                }`}
              >
                {shown.map(l => <LeadCard key={l.id} l={l} dragging={drag === l.id} onDrag={setDrag} />)}
                {col.length > shown.length && <Link to={`/leads?pipeline=${pid}&status=${s.id}`} className="block rounded-xl py-1.5 text-center text-xs font-medium text-slate-500 hover:bg-white hover:text-slate-900">{col.length - shown.length} more</Link>}
                {!col.length && (
                  <p className={`py-8 text-center text-xs transition-colors ${active ? 'text-slate-500' : 'text-slate-400'}`}>
                    {active ? `Drop in ${s.label}` : 'No leads'}
                  </p>
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
