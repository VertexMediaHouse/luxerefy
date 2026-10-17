import { useMutation, useQuery } from '@tanstack/react-query'
import { db, respond, write } from '../../lib/mock/db'
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
        write(() => {
          guard()
          const v = clean(name, 'pipeline')
          if (db.pipelines.some(p => p.name.toLowerCase() === v.toLowerCase())) throw new Error('A pipeline with that name already exists.')
          const { pipeline, stages } = build(v, new Date().toISOString())
          db.pipelines.push(pipeline)
          db.stages.push(...stages)
          return pipeline
        }),
    }),

    addStage: useMutation({
      mutationFn: ({ pipeline_id, label, tone }: { pipeline_id: string; label: string; tone: Tone }) =>
        write(() => {
          guard()
          const v = clean(label, 'stage')
          const list = stagesOf(pipeline_id)
          if (list.some(s => s.label.toLowerCase() === v.toLowerCase())) throw new Error('That stage already exists on this pipeline.')
          if (list.filter(s => s.kind === 'open').length >= 8) throw new Error('Eight working stages is the practical limit for one board.')
          // Land it just before Won so the two terminals stay at the end.
          const at = list.find(s => s.kind === 'won')?.position ?? list.length
          for (const s of list) if (s.position >= at) s.position++
          db.stages.push({ id: newStageId(pipeline_id), pipeline_id, label: v, tone, position: at, kind: 'open' })
        }),
    }),

    editStage: useMutation({
      mutationFn: ({ id, label, tone }: { id: string; label: string; tone: Tone }) =>
        write(() => {
          guard()
          const s = db.stages.find(s => s.id === id)
          if (!s) throw new Error('Stage not found')
          Object.assign(s, { label: clean(label, 'stage'), tone })
        }),
    }),

    /** Only the working stages shuffle: the entry stage stays first, the terminals stay last. */
    moveStage: useMutation({
      mutationFn: ({ id, by }: { id: string; by: -1 | 1 }) =>
        write(() => {
          guard()
          const s = db.stages.find(s => s.id === id)
          if (!s || s.kind !== 'open') throw new Error('Only the working stages can be reordered.')
          const open = stagesOf(s.pipeline_id).filter(o => o.kind === 'open')
          const swap = open[open.findIndex(o => o.id === id) + by]
          if (!swap) return
          const p = s.position
          s.position = swap.position
          swap.position = p
        }),
    }),
  }
}
