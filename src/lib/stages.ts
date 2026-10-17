// Lead stages used to be a union in labels.ts. They are rows now, so a manager can rename,
// reorder and add them, and run more than one board. Reads go straight at the live `db`
// object, which keeps these callable from render code (StageChip) with no hook.
import { db } from './mock/db'
import { isTerminalId } from './rules'
import type { LeadStatus, Pipeline, Stage, Tone } from './types'

/** Offered when a manager adds a stage. Deliberately the same six the Badge already renders. */
export const STAGE_TONES: Tone[] = ['slate', 'blue', 'violet', 'amber', 'green', 'red']

const byPos = (a: { position: number }, b: { position: number }) => a.position - b.position

export const pipelines = () => [...db.pipelines].sort(byPos)
/** New enquiries land here. Lowest position wins, so it survives a rename. */
export const defaultPipeline = (): Pipeline => pipelines()[0]

export const stagesOf = (pipelineId: string) => db.stages.filter(s => s.pipeline_id === pipelineId).sort(byPos)
export const stage = (id: LeadStatus): Stage | undefined => db.stages.find(s => s.id === id)

/** A lead whose stage row vanished still has to render, so fall back to the raw id. */
export const stageLabel = (id: LeadStatus) => stage(id)?.label ?? id
export const stageTone = (id: LeadStatus): Tone => stage(id)?.tone ?? 'slate'
export const stageKind = (id: LeadStatus) => stage(id)?.kind ?? (isTerminalId(id) ? 'won' : 'open')

/** 0 at the entry stage, 1 at a terminal: drives the filling ring in StageIcon. */
export function stageProgress(id: LeadStatus): number {
  const s = stage(id)
  if (!s || s.kind === 'won' || s.kind === 'lost') return 1
  const open = stagesOf(s.pipeline_id).filter(o => o.kind === 'entry' || o.kind === 'open')
  const i = open.findIndex(o => o.id === s.id)
  return open.length < 2 || i < 1 ? 0 : i / open.length
}

/** Stage ids are generated, never typed, so a custom one can never collide with a reserved suffix. */
export const newStageId = (pipelineId: string) => `${pipelineId}-s${db.stages.length + 1}-${Date.now().toString(36)}`
