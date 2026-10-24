import { useState, type DragEvent } from 'react'
import { Link } from 'react-router'
import { Building2, CalendarCheck, Clock, FileText, MessageSquare, Phone, Plus, Trash2, Users } from 'lucide-react'
import { Avatar, StageIcon, TONE_HEX } from '../../components/ui'
import { SOURCE_LABEL } from '../../lib/labels'
import { defaultPipeline, stagesOf, stageTone } from '../../lib/stages'
import { budget, prettyPhone, relative } from '../../lib/format'
import type { LeadStatus } from '../../lib/types'
import { db } from '../../lib/mock/db'
import { interestOf, useDeleteLead, useMoveLead, type LeadRow } from './api'

const cr = (n: number) => +(n / 1e7).toFixed(2)
/** "₹2–2.5 Cr" when both ends are in crores, else the long form. */
const shortBudget = (min: number | null, max: number | null) =>
  min && max && min >= 1e7 && max > min ? `₹${cr(min)}–${cr(max)} Cr` : budget(min, max)
/** Column totals get one decimal at most — a header is not a report. */
const sum = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(n >= 1e8 ? 0 : 1)} Cr` : n >= 1e5 ? `₹${Math.round(n / 1e5)} L` : '')

const DAY = 86400e3

const SOURCE_STYLE: Record<string, string> = {
  sales_form: 'bg-blue-50 text-blue-700 ring-1 ring-blue-600/20',
  '99acres': 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/20',
  social_media: 'bg-purple-50 text-purple-700 ring-1 ring-purple-600/20',
  referral: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20',
  website: 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-600/20',
  property_page: 'bg-sky-50 text-sky-700 ring-1 ring-sky-600/20',
  walk_in: 'bg-slate-100 text-slate-700 ring-1 ring-slate-400/20',
  other: 'bg-slate-50 text-slate-600 ring-1 ring-slate-300/20',
}

function TaskIcon({ kind }: { kind: string }) {
  if (kind === 'call') return <Phone className="size-3 shrink-0" />
  if (kind === 'site_visit') return <CalendarCheck className="size-3 shrink-0 text-emerald-600" />
  if (kind === 'meeting') return <Users className="size-3 shrink-0 text-purple-600" />
  if (kind === 'text') return <MessageSquare className="size-3 shrink-0" />
  if (kind === 'documents') return <FileText className="size-3 shrink-0 text-amber-600" />
  return <Clock className="size-3 shrink-0" />
}

function LeadCard({ l, dragging, onDrag }: { l: LeadRow; dragging: boolean; onDrag: (id: string | null) => void }) {
  const task = l.next_task
  const overdue = !!task && Date.parse(task.due_at) < Date.now()
  const idle = Math.floor((Date.now() - Date.parse(l.updated_at)) / DAY)
  const assignee = l.assigned_to ? db.profiles.find(p => p.id === l.assigned_to) : null
  const del = useDeleteLead()

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
      className={`group relative block cursor-grab overflow-hidden rounded-xl bg-white p-3 pl-3.5 shadow-sm ring-1 ring-slate-200/80 transition active:cursor-grabbing hover:border-slate-300 hover:shadow-md ${
        dragging ? 'scale-[0.98] opacity-40' : ''
      }`}
    >
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: TONE_HEX[stageTone(l.status)] }} aria-hidden />

      {/* Header: Avatar, Name, Phone & Budget, Assignee */}
      <div className="flex items-start gap-2.5">
        <Avatar name={l.contact.name} size="sm" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-xs font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
            {l.contact.name}
          </p>
          <a
            href={`tel:${l.contact.phone}`}
            onClick={e => e.stopPropagation()}
            className="mt-0.5 inline-flex items-center gap-1 truncate text-[10px] text-slate-500 hover:text-blue-600"
            title="Call contact"
          >
            <Phone className="size-2.5 shrink-0 text-slate-400" />
            <span className="truncate">{prettyPhone(l.contact.phone)}</span>
          </a>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-bold text-slate-900 tabular-nums">
              {shortBudget(l.budget_min, l.budget_max)}
            </span>
            <button
              type="button"
              onClick={e => {
                e.preventDefault()
                e.stopPropagation()
                if (confirm(`Remove lead "${l.contact.name}"?`)) {
                  del.mutate(l.id)
                }
              }}
              className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-red-600 transition rounded hover:bg-red-50"
              title="Remove lead"
              aria-label="Remove lead"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
          {assignee && (
            <span
              title={`Assigned to ${assignee.full_name}`}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.2 text-[9px] font-medium text-slate-600 ring-1 ring-slate-200"
            >
              <span className="size-1.5 rounded-full bg-emerald-500" />
              {assignee.full_name.split(' ')[0]}
            </span>
          )}
        </div>
      </div>

      {/* Property / Interest Mini Card */}
      <div className="mt-2 flex items-center gap-2 rounded-lg bg-slate-50/80 p-1.5 text-xs text-slate-700">
        {l.properties[0]?.images[0] ? (
          <img
            src={l.properties[0].images[0]}
            alt=""
            loading="lazy"
            className="size-7 shrink-0 rounded object-cover shadow-2xs"
          />
        ) : (
          <div className="flex size-7 shrink-0 items-center justify-center rounded bg-slate-200/70 text-slate-500">
            <Building2 className="size-3.5" />
          </div>
        )}
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[11px] font-medium text-slate-800">
            {interestOf(l) ?? 'General enquiry'}
            {l.properties.length > 1 && <span className="font-normal text-slate-400"> +{l.properties.length - 1}</span>}
          </p>
          <p className="truncate text-[10px] text-slate-400">
            {l.properties[0]?.locality || l.city || 'Ahmedabad'}
            {l.properties[0]?.config ? ` · ${l.properties[0].config}` : ''}
          </p>
        </div>
      </div>

      {/* Source, Referral Attribution & Age */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
        <span className={`rounded px-1.5 py-0.5 font-medium ${SOURCE_STYLE[l.source] ?? SOURCE_STYLE.other}`}>
          {SOURCE_LABEL[l.source] || l.source}
        </span>
        {l.referral_detail && (
          <span
            className="truncate max-w-[90px] rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600"
            title={l.referral_detail}
          >
            {l.referral_detail}
          </span>
        )}
        <span className="ml-auto text-slate-400 text-[10px]">{relative(l.created_at)}</span>
        {idle >= 5 && (
          <span
            className="rounded bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-700 ring-1 ring-amber-500/20"
            title={`No activity in ${idle} days`}
          >
            {idle}d idle
          </span>
        )}
      </div>

      {/* Footer: Follow-up task & Activity/Docs counter */}
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[10px] text-slate-400">
        {task ? (
          <div
            className={`flex min-w-0 items-center gap-1 font-medium ${overdue ? 'text-red-600' : 'text-slate-600'}`}
            title={`${task.title} (due ${relative(task.due_at)})`}
          >
            <TaskIcon kind={task.kind} />
            <span className="truncate max-w-[110px]">{task.title}</span>
            <span className={`shrink-0 text-[9px] ${overdue ? 'font-bold text-red-500' : 'text-slate-400'}`}>
              · {relative(task.due_at)}
            </span>
          </div>
        ) : (
          <span className="text-[10px] text-slate-300">No follow-up</span>
        )}

        <div className="flex shrink-0 items-center gap-2 text-slate-400">
          <span className="flex items-center gap-0.5" title={`${l.activity_count} activities`}>
            <MessageSquare className="size-3 text-slate-400" />
            <span className="tabular-nums font-medium">{l.activity_count}</span>
          </span>
          {l.doc_count > 0 && (
            <span className="flex items-center gap-0.5 text-blue-600 font-medium" title={`${l.doc_count} documents`}>
              <FileText className="size-3" />
              <span className="tabular-nums">{l.doc_count}</span>
            </span>
          )}
        </div>
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
                className={`space-y-2.5 rounded-2xl p-2 ring-1 ring-inset transition-colors ${
                  active ? 'bg-slate-200/80 ring-slate-300' : 'bg-slate-100 ring-slate-200/70'
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
