import { useState, type FormEvent } from 'react'
import { ChevronDown, ChevronUp, KanbanSquare, Lock, Pencil, Plus, SlidersHorizontal } from 'lucide-react'
import { Button, Card, CardHeader, Empty, ErrorText, Field, Loading, Modal, PageHeader, StageIcon, inputCls } from '../../components/ui'
import { STAGE_TONES } from '../../lib/stages'
import { isManager } from '../../lib/rules'
import { useUser } from '../../lib/session'
import type { Stage, Tone } from '../../lib/types'
import { usePipelineActions, usePipelines } from './api'

const TONE_SWATCH: Record<Tone, string> = {
  slate: 'bg-slate-400', blue: 'bg-sky-500', violet: 'bg-violet-500',
  amber: 'bg-amber-500', green: 'bg-emerald-500', red: 'bg-rose-500',
}

function TonePicker({ value, onChange }: { value: Tone; onChange: (t: Tone) => void }) {
  return (
    <div className="flex gap-1.5" role="radiogroup" aria-label="Stage colour">
      {STAGE_TONES.map(t => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={t === value}
          aria-label={t}
          onClick={() => onChange(t)}
          className={`size-6 rounded-full ${TONE_SWATCH[t]} transition ${t === value ? 'ring-2 ring-slate-900 ring-offset-2' : 'opacity-60 hover:opacity-100'}`}
        />
      ))}
    </div>
  )
}

/** Rename + recolour one stage. The three reserved stages may be renamed but not moved. */
function StageRow({ stage, first, last, onEdit }: { stage: Stage; first: boolean; last: boolean; onEdit: () => void }) {
  const { moveStage } = usePipelineActions()
  const fixed = stage.kind !== 'open'
  return (
    <li className="flex items-center gap-3 px-5 py-2.5">
      <StageIcon status={stage.id} className="size-4" />
      <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{stage.label}</span>

      {fixed ? (
        <span className="flex items-center gap-1 text-xs text-slate-400" title="Won, Lost and the entry stage keep their place, because the rest of the CRM counts on them">
          <Lock className="size-3" /> {stage.kind === 'entry' ? 'entry' : stage.kind}
        </span>
      ) : (
        <span className="flex items-center gap-0.5">
          <button type="button" disabled={first} onClick={() => moveStage.mutate({ id: stage.id, by: -1 })} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 disabled:hover:bg-transparent" aria-label={`Move ${stage.label} earlier`}>
            <ChevronUp className="size-4" />
          </button>
          <button type="button" disabled={last} onClick={() => moveStage.mutate({ id: stage.id, by: 1 })} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 disabled:hover:bg-transparent" aria-label={`Move ${stage.label} later`}>
            <ChevronDown className="size-4" />
          </button>
        </span>
      )}

      <button type="button" onClick={onEdit} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Rename ${stage.label}`}>
        <Pencil className="size-3.5" />
      </button>
    </li>
  )
}

export function PipelinesPage() {
  const user = useUser()
  const mgr = isManager(user)
  const { data: pipes } = usePipelines()
  const { addStage, createPipeline, editStage } = usePipelineActions()
  const [editing, setEditing] = useState<Stage | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [newPipeline, setNewPipeline] = useState(false)
  const [tone, setTone] = useState<Tone>('blue')

  if (!pipes) return <Loading />

  const submitStage = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const label = String(new FormData(e.currentTarget).get('label') ?? '')
    if (editing) editStage.mutate({ id: editing.id, label, tone }, { onSuccess: () => setEditing(null) })
    else if (adding) addStage.mutate({ pipeline_id: adding, label, tone }, { onSuccess: () => setAdding(null) })
  }

  return (
    <>
      <PageHeader
        icon={SlidersHorizontal}
        tint="text-violet-500"
        title="Pipeline setup"
        subtitle={mgr ? 'Rename stages, reorder the middle of a board, or run a second pipeline alongside the first.' : 'Only owners and managers can change pipelines.'}
        actions={mgr ? <Button onClick={() => setNewPipeline(true)}><Plus className="size-4" /> New pipeline</Button> : undefined}
      />

      <ErrorText error={createPipeline.error} />

      <div className="grid gap-4 lg:grid-cols-2">
        {pipes.map(p => {
          const open = p.stages.filter(s => s.kind === 'open')
          return (
            <Card key={p.id}>
              <CardHeader
                title={p.name}
                subtitle={`${p.stages.length} stages · ${p.open_count} open of ${p.lead_count}`}
                action={mgr ? (
                  <button type="button" onClick={() => { setTone('blue'); setAdding(p.id) }} className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900">
                    <Plus className="size-3.5" /> Add stage
                  </button>
                ) : undefined}
              />
              <ol className="divide-y divide-slate-100">
                {p.stages.map(s => (
                  <StageRow
                    key={s.id}
                    stage={s}
                    first={s.id === open[0]?.id}
                    last={s.id === open[open.length - 1]?.id}
                    onEdit={() => { setTone(s.tone); setEditing(s) }}
                  />
                ))}
              </ol>
              {!open.length && (
                <p className="px-5 pb-4 text-xs text-slate-400">
                  Just the reserved stages so far. Add the steps your team actually works through.
                </p>
              )}
            </Card>
          )
        })}
        {!pipes.length && <Card><Empty icon={KanbanSquare}>No pipelines yet.</Empty></Card>}
      </div>

      <Modal open={!!editing || !!adding} onClose={() => { setEditing(null); setAdding(null) }} title={editing ? `Edit ${editing.label}` : 'Add a stage'}>
        <form onSubmit={submitStage} className="space-y-4">
          <Field label="Stage name">
            <input name="label" defaultValue={editing?.label ?? ''} required maxLength={40} autoFocus className={inputCls} placeholder="e.g. Potential Visit" />
          </Field>
          <Field label="Colour" hint="Shown on the board column and on every card in it.">
            <TonePicker value={tone} onChange={setTone} />
          </Field>
          {adding && <p className="text-xs text-slate-400">New stages land just before Won, so the two closing stages stay at the end of the board.</p>}
          <ErrorText error={editing ? editStage.error : addStage.error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => { setEditing(null); setAdding(null) }}>Cancel</Button>
            <Button type="submit" disabled={editStage.isPending || addStage.isPending}>{editing ? 'Save' : 'Add stage'}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={newPipeline} onClose={() => setNewPipeline(false)} title="New pipeline">
        <form
          onSubmit={e => {
            e.preventDefault()
            const name = String(new FormData(e.currentTarget).get('name') ?? '')
            createPipeline.mutate(name, { onSuccess: () => setNewPipeline(false) })
          }}
          className="space-y-4"
        >
          <Field label="Pipeline name" hint="It starts with New Lead, Won and Lost. Add your own stages in between.">
            <input name="name" required maxLength={40} autoFocus className={inputCls} placeholder="e.g. Rentals" />
          </Field>
          <ErrorText error={createPipeline.error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setNewPipeline(false)}>Cancel</Button>
            <Button type="submit" disabled={createPipeline.isPending}>Create pipeline</Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
