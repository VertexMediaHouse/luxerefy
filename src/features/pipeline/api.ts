import { useMutation, useQuery } from '@tanstack/react-query'
import { db, ok, respond, write } from '../../lib/db'
import { supabase } from '../../lib/supabase'
import { entryOf, isManager, isOpen, lostOf, uid, wonOf } from '../../lib/rules'
import { useUser } from '../../lib/session'
import { newStageId, pipelines, stagesOf } from '../../lib/stages'
import type { Pipeline, Stage, Tone } from '../../lib/types'

export type PipelineRow = Pipeline & { stages: Stage[]; lead_count: number; open_count: number }

export function usePipelines() {
  return useQuery({
    queryKey: ['pipelines'],
    queryFn: () =>
      respond(
        pipelines().map((p): PipelineRow => {
          const mine = db.leads.filter(l => l.pipeline_id === p.id)
          return { ...p, stages: stagesOf(p.id), lead_count: mine.length, open_count: mine.filter(isOpen).length }
        }),
      ),
  })
}

/** A fresh board starts with just the three reserved stages; the manager adds the middle. */
function build(name: string, at: string) {
  const id = 'pl-' + uid().slice(0, 8)
  const pipeline: Pipeline = { id, name, position: Math.max(0, ...db.pipelines.map(p => p.position)) + 1, created_at: at }
  const stages: Stage[] = [
    { id: entryOf(id), pipeline_id: id, label: 'New Lead', tone: 'slate', position: 0, kind: 'entry' },
    { id: wonOf(id), pipeline_id: id, label: 'Won', tone: 'green', position: 1, kind: 'won' },
    { id: lostOf(id), pipeline_id: id, label: 'Lost', tone: 'red', position: 2, kind: 'lost' },
  ]
  return { pipeline, stages }
}

export function usePipelineActions() {
  const user = useUser()
  // Agents work the board; only owners and managers reshape it, as with reassignment.
  // RLS enforces the same thing; these guards only exist to name the reason.
  const guard = () => { if (!isManager(user)) throw new Error('Only owners and managers can change pipelines.') }
  const clean = (s: string, what: string) => {
    const v = s.trim()
    if (!v) throw new Error(`Give the ${what} a name.`)
    if (v.length > 40) throw new Error(`Keep the ${what} name under 40 characters.`)
    return v
  }

  return {
    createPipeline: useMutation({
      mutationFn: (name: string) =>
        write(async () => {
          guard()
          const v = clean(name, 'pipeline')
          if (db.pipelines.some(p => p.name.toLowerCase() === v.toLowerCase())) throw new Error('A pipeline with that name already exists.')
          const { pipeline, stages } = build(v, new Date().toISOString())
          ok(await supabase.from('pipelines').insert(pipeline))
          ok(await supabase.from('stages').insert(stages))
          return pipeline
        }),
    }),

    renamePipeline: useMutation({
      mutationFn: ({ id, name }: { id: string; name: string }) =>
        write(async () => {
          guard()
          const v = clean(name, 'pipeline')
          if (!db.pipelines.some(p => p.id === id)) throw new Error('Pipeline not found')
          if (db.pipelines.some(o => o.id !== id && o.name.toLowerCase() === v.toLowerCase())) throw new Error('A pipeline with that name already exists.')
          ok(await supabase.from('pipelines').update({ name: v }).eq('id', id))
        }),
    }),

    deletePipeline: useMutation({
      mutationFn: (id: string) =>
        write(async () => {
          guard()
          if (db.pipelines.length <= 1) throw new Error('You cannot delete the only remaining pipeline.')
          const leadsInPipe = db.leads.filter(l => l.pipeline_id === id)
          if (leadsInPipe.length > 0) throw new Error(`Cannot delete pipeline: it contains ${leadsInPipe.length} lead(s). Move or delete them first.`)
          // stages.pipeline_id cascades, so the columns go with the board.
          ok(await supabase.from('pipelines').delete().eq('id', id))
        }),
    }),

    deleteStage: useMutation({
      mutationFn: (id: string) =>
        write(async () => {
          guard()
          const s = db.stages.find(s => s.id === id)
          if (!s) throw new Error('Stage not found')
          if (s.kind !== 'open') throw new Error('Cannot delete reserved stages (entry, Won, Lost).')
          const leadsInStage = db.leads.filter(l => l.status === id)
          if (leadsInStage.length > 0) throw new Error(`Cannot delete stage: ${leadsInStage.length} lead(s) currently in this stage. Move them first.`)
          ok(await supabase.from('stages').delete().eq('id', id))
        }),
    }),

    addStage: useMutation({
      mutationFn: ({ pipeline_id, label, tone }: { pipeline_id: string; label: string; tone: Tone }) =>
        write(async () => {
          guard()
          const v = clean(label, 'stage')
          const list = stagesOf(pipeline_id)
          if (list.some(s => s.label.toLowerCase() === v.toLowerCase())) throw new Error('That stage already exists on this pipeline.')
          if (list.filter(s => s.kind === 'open').length >= 8) throw new Error('Eight working stages is the practical limit for one board.')
          // Land it just before Won so the two terminals stay at the end.
          const at = list.find(s => s.kind === 'won')?.position ?? list.length
          for (const s of list.filter(s => s.position >= at))
            ok(await supabase.from('stages').update({ position: s.position + 1 }).eq('id', s.id))
          ok(await supabase.from('stages').insert({ id: newStageId(pipeline_id), pipeline_id, label: v, tone, position: at, kind: 'open' }))
        }),
    }),

    editStage: useMutation({
      mutationFn: ({ id, label, tone }: { id: string; label: string; tone: Tone }) =>
        write(async () => {
          guard()
          if (!db.stages.some(s => s.id === id)) throw new Error('Stage not found')
          ok(await supabase.from('stages').update({ label: clean(label, 'stage'), tone }).eq('id', id))
        }),
    }),

    /** Only the working stages shuffle: the entry stage stays first, the terminals stay last. */
    moveStage: useMutation({
      mutationFn: ({ id, by }: { id: string; by: -1 | 1 }) =>
        write(async () => {
          guard()
          const s = db.stages.find(s => s.id === id)
          if (!s || s.kind !== 'open') throw new Error('Only the working stages can be reordered.')
          const open = stagesOf(s.pipeline_id).filter(o => o.kind === 'open')
          const swap = open[open.findIndex(o => o.id === id) + by]
          if (!swap) return
          ok(await supabase.from('stages').update({ position: swap.position }).eq('id', s.id))
          ok(await supabase.from('stages').update({ position: s.position }).eq('id', swap.id))
        }),
    }),
  }
}
