import { useMutation, useQuery } from '@tanstack/react-query'
import { db, respond, write } from '../../lib/mock/db'
import { supabase } from '../../lib/supabase'
import { entryOf, isManager, isOpen, lostOf, wonOf } from '../../lib/rules'
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
function build(id: string, name: string) {
  const pipeline = { id, name, position: Math.max(0, ...db.pipelines.map(p => p.position)) + 1 }
  const stages: Omit<Stage, 'pipeline_id'>[] = [
    { id: entryOf(id), label: 'New Lead', tone: 'slate' as Tone, position: 0, kind: 'entry' as const },
    { id: wonOf(id), label: 'Won', tone: 'green' as Tone, position: 1, kind: 'won' as const },
    { id: lostOf(id), label: 'Lost', tone: 'red' as Tone, position: 2, kind: 'lost' as const },
  ]
  return { pipeline, stages: stages.map(s => ({ ...s, pipeline_id: id })) }
}

export function usePipelineActions() {
  const user = useUser()
  // Agents work the board; only owners and managers reshape it, as with reassignment.
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
          const id = 'pl-' + crypto.randomUUID().slice(0, 8)
          const { pipeline, stages } = build(id, v)
          const { error: pErr } = await supabase.from('pipelines').insert(pipeline)
          if (pErr) throw new Error(pErr.message)
          const { error: sErr } = await supabase.from('stages').insert(stages)
          if (sErr) throw new Error(sErr.message)
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
          const { error } = await supabase.from('pipelines').update({ name: v }).eq('id', id)
          if (error) throw new Error(error.message)
        }),
    }),

    deletePipeline: useMutation({
      mutationFn: (id: string) =>
        write(async () => {
          guard()
          if (db.pipelines.length <= 1) throw new Error('You cannot delete the only remaining pipeline.')
          const leadsInPipe = db.leads.filter(l => l.pipeline_id === id)
          if (leadsInPipe.length > 0) throw new Error(`Cannot delete pipeline: it contains ${leadsInPipe.length} lead(s). Move or delete them first.`)
          const { error } = await supabase.from('pipelines').delete().eq('id', id)
          if (error) throw new Error(error.message)
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
          const { error } = await supabase.from('stages').delete().eq('id', id)
          if (error) throw new Error(error.message)
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
          // Land it just before Won so the two terminals stay at the end. Shift highest-position
          // first so each update's target slot is free (the unique (pipeline_id, position) index
          // would otherwise reject landing on a slot the next row hasn't vacated yet).
          const at = list.find(s => s.kind === 'won')?.position ?? list.length
          const toShift = list.filter(s => s.position >= at).sort((a, b) => b.position - a.position)
          for (const s of toShift) await supabase.from('stages').update({ position: s.position + 1 }).eq('id', s.id)
          const { error } = await supabase.from('stages').insert({ id: newStageId(pipeline_id), pipeline_id, label: v, tone, position: at, kind: 'open' })
          if (error) throw new Error(error.message)
        }),
    }),

    editStage: useMutation({
      mutationFn: ({ id, label, tone }: { id: string; label: string; tone: Tone }) =>
        write(async () => {
          guard()
          if (!db.stages.some(s => s.id === id)) throw new Error('Stage not found')
          const { error } = await supabase.from('stages').update({ label: clean(label, 'stage'), tone }).eq('id', id)
          if (error) throw new Error(error.message)
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
          // Swap via a scratch position so the unique (pipeline_id, position) index never sees a collision.
          await supabase.from('stages').update({ position: -1 }).eq('id', s.id)
          await supabase.from('stages').update({ position: s.position }).eq('id', swap.id)
          await supabase.from('stages').update({ position: swap.position }).eq('id', s.id)
        }),
    }),
  }
}
