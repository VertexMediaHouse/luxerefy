import { useState, type FormEvent } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Columns,
  Eye,
  FolderPlus,
  Lock,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react'
import { Button, ErrorText, Field, StageIcon, inputCls } from '../../components/ui'
import { STAGE_TONES, stagesOf } from '../../lib/stages'
import { isManager } from '../../lib/rules'
import { useUser } from '../../lib/session'
import type { Stage, Tone } from '../../lib/types'
import { usePipelineActions, type PipelineRow } from './api'

const TONE_SWATCH: Record<Tone, string> = {
  slate: 'bg-slate-400',
  blue: 'bg-sky-500',
  violet: 'bg-violet-500',
  amber: 'bg-amber-500',
  green: 'bg-emerald-500',
  red: 'bg-rose-500',
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
          className={`size-6 rounded-full ${TONE_SWATCH[t]} transition ${
            t === value ? 'ring-2 ring-slate-900 ring-offset-2' : 'opacity-60 hover:opacity-100'
          }`}
        />
      ))}
    </div>
  )
}

export interface SavedKanbanView {
  id: string
  name: string
  visibleStages: string[]
  createdAt: string
}

export function PipelineSetupModal({
  open,
  onClose,
  pipelines,
  activePipelineId,
  onSelectPipeline,
  views,
  activeViewId,
  onSelectView,
  onSaveViews,
}: {
  open: boolean
  onClose: () => void
  pipelines: PipelineRow[]
  activePipelineId: string
  onSelectPipeline: (id: string) => void
  views: SavedKanbanView[]
  activeViewId: string | null
  onSelectView: (id: string | null) => void
  onSaveViews: (views: SavedKanbanView[]) => void
}) {
  const user = useUser()
  const mgr = isManager(user)
  const [tab, setTab] = useState<'pipelines' | 'stages' | 'views'>('stages')

  const {
    createPipeline,
    renamePipeline,
    deletePipeline,
    addStage,
    editStage,
    moveStage,
    deleteStage,
  } = usePipelineActions()

  // Selected pipeline for editing
  const [selectedPipelineId, setSelectedPipelineId] = useState(activePipelineId)
  const currentPipe = pipelines.find(p => p.id === selectedPipelineId) ?? pipelines[0]
  const stages = currentPipe ? stagesOf(currentPipe.id) : []
  const openStages = stages.filter(s => s.kind === 'open')

  // Pipeline form states
  const [isCreatingPipe, setIsCreatingPipe] = useState(false)
  const [newPipeName, setNewPipeName] = useState('')
  const [editingPipeId, setEditingPipeId] = useState<string | null>(null)
  const [renamePipeName, setRenamePipeName] = useState('')

  // Stage form states
  const [addingStage, setAddingStage] = useState(false)
  const [newStageLabel, setNewStageLabel] = useState('')
  const [stageTone, setStageTone] = useState<Tone>('blue')
  const [editingStage, setEditingStage] = useState<Stage | null>(null)
  const [editStageLabel, setEditStageLabel] = useState('')
  const [editStageTone, setEditStageTone] = useState<Tone>('blue')

  // Custom view states
  const [newViewName, setNewViewName] = useState('')
  const [selectedStagesForView, setSelectedStagesForView] = useState<string[]>(
    stages.map(s => s.id),
  )

  if (!open) return null

  const handleCreatePipeline = (e: FormEvent) => {
    e.preventDefault()
    if (!newPipeName.trim()) return
    createPipeline.mutate(newPipeName, {
      onSuccess: newP => {
        setNewPipeName('')
        setIsCreatingPipe(false)
        setSelectedPipelineId(newP.id)
        onSelectPipeline(newP.id)
      },
    })
  }

  const handleRenamePipeline = (id: string) => {
    if (!renamePipeName.trim()) return
    renamePipeline.mutate(
      { id, name: renamePipeName },
      {
        onSuccess: () => setEditingPipeId(null),
      },
    )
  }

  const handleDeletePipeline = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete pipeline "${name}"?`)) {
      deletePipeline.mutate(id, {
        onSuccess: () => {
          const remaining = pipelines.filter(p => p.id !== id)
          if (remaining.length > 0) {
            setSelectedPipelineId(remaining[0].id)
            onSelectPipeline(remaining[0].id)
          }
        },
      })
    }
  }

  const handleAddStage = (e: FormEvent) => {
    e.preventDefault()
    if (!newStageLabel.trim() || !currentPipe) return
    addStage.mutate(
      { pipeline_id: currentPipe.id, label: newStageLabel, tone: stageTone },
      {
        onSuccess: () => {
          setAddingStage(false)
          setNewStageLabel('')
          setStageTone('blue')
        },
      },
    )
  }

  const handleEditStage = (e: FormEvent) => {
    e.preventDefault()
    if (!editingStage || !editStageLabel.trim()) return
    editStage.mutate(
      { id: editingStage.id, label: editStageLabel, tone: editStageTone },
      {
        onSuccess: () => {
          setEditingStage(null)
        },
      },
    )
  }

  const handleDeleteStage = (s: Stage) => {
    if (confirm(`Delete the stage "${s.label}"?`)) {
      deleteStage.mutate(s.id)
    }
  }

  const handleSaveCustomView = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = newViewName.trim()
    if (!trimmed) return
    if (selectedStagesForView.length === 0) {
      alert('Please select at least one stage for this view.')
      return
    }
    const newView: SavedKanbanView = {
      id: 'view-' + Date.now().toString(36),
      name: trimmed,
      visibleStages: [...selectedStagesForView],
      createdAt: new Date().toISOString(),
    }
    const nextViews = [...views, newView]
    onSaveViews(nextViews)
    onSelectView(newView.id)
    setNewViewName('')
  }

  const handleDeleteCustomView = (id: string) => {
    const nextViews = views.filter(v => v.id !== id)
    onSaveViews(nextViews)
    if (activeViewId === id) {
      onSelectView(null)
    }
  }

  const toggleStageInViewBuilder = (stageId: string) => {
    if (selectedStagesForView.includes(stageId)) {
      setSelectedStagesForView(selectedStagesForView.filter(id => id !== stageId))
    } else {
      setSelectedStagesForView([...selectedStagesForView, stageId])
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-slate-900 text-amber-400">
              <SlidersHorizontal className="size-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Customise Pipeline & Kanban Views</h2>
              <p className="text-xs text-slate-500">
                Manage pipelines, customise stages, and build personalized Kanban view column layouts.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 border-b border-slate-100 bg-slate-50/70 px-6 py-2">
          <button
            type="button"
            onClick={() => setTab('stages')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium transition ${
              tab === 'stages'
                ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <SlidersHorizontal className="size-3.5" />
            Configure Stages
          </button>
          <button
            type="button"
            onClick={() => setTab('views')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium transition ${
              tab === 'views'
                ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Columns className="size-3.5" />
            Custom Kanban Views ({views.length})
          </button>
          {mgr && (
            <button
              type="button"
              onClick={() => setTab('pipelines')}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium transition ${
                tab === 'pipelines'
                  ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <FolderPlus className="size-3.5" />
              Manage Pipelines ({pipelines.length})
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* TAB 1: CONFIGURE STAGES */}
          {tab === 'stages' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200/60">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-500">Active Pipeline:</span>
                  <select
                    value={selectedPipelineId}
                    onChange={e => {
                      setSelectedPipelineId(e.target.value)
                      onSelectPipeline(e.target.value)
                    }}
                    className="rounded-lg border-0 bg-white py-1 pr-8 pl-2.5 text-xs font-medium text-slate-900 shadow-sm ring-1 ring-slate-200 focus:ring-2 focus:ring-slate-900"
                  >
                    {pipelines.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.stages.length} stages)
                      </option>
                    ))}
                  </select>
                </div>
                {mgr && (
                  <Button
                    onClick={() => {
                      setAddingStage(true)
                      setEditingStage(null)
                    }}
                    className="text-xs"
                  >
                    <Plus className="size-3.5" /> Add stage
                  </Button>
                )}
              </div>

              {/* Add stage inline form */}
              {addingStage && (
                <form
                  onSubmit={handleAddStage}
                  className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/50 p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-blue-900">Add New Stage to {currentPipe.name}</span>
                    <button
                      type="button"
                      onClick={() => setAddingStage(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Stage label">
                      <input
                        value={newStageLabel}
                        onChange={e => setNewStageLabel(e.target.value)}
                        placeholder="e.g. In Negotiation / Site Visit"
                        required
                        autoFocus
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Color Theme">
                      <TonePicker value={stageTone} onChange={setStageTone} />
                    </Field>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    New stages are placed right before Won, keeping terminal stages cleanly at the end.
                  </p>
                  <ErrorText error={addStage.error} />
                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setAddingStage(false)}
                      className="text-xs"
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={addStage.isPending} className="text-xs">
                      {addStage.isPending ? 'Saving...' : 'Add stage'}
                    </Button>
                  </div>
                </form>
              )}

              {/* Edit stage inline form */}
              {editingStage && (
                <form
                  onSubmit={handleEditStage}
                  className="space-y-3 rounded-xl border border-amber-100 bg-amber-50/40 p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-amber-900">Edit Stage: {editingStage.label}</span>
                    <button
                      type="button"
                      onClick={() => setEditingStage(null)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Stage label">
                      <input
                        value={editStageLabel}
                        onChange={e => setEditStageLabel(e.target.value)}
                        required
                        autoFocus
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Color Theme">
                      <TonePicker value={editStageTone} onChange={setEditStageTone} />
                    </Field>
                  </div>
                  <ErrorText error={editStage.error} />
                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setEditingStage(null)}
                      className="text-xs"
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={editStage.isPending} className="text-xs">
                      {editStage.isPending ? 'Saving...' : 'Save changes'}
                    </Button>
                  </div>
                </form>
              )}

              {/* Stage list */}
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="bg-slate-50 px-4 py-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                  Board Stage Order (Left to Right)
                </div>
                <ul className="divide-y divide-slate-100">
                  {stages.map(s => {
                    const isFixed = s.kind !== 'open'
                    const isFirst = s.id === openStages[0]?.id
                    const isLast = s.id === openStages[openStages.length - 1]?.id

                    return (
                      <li
                        key={s.id}
                        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50/50"
                      >
                        <div className="flex items-center gap-3">
                          <StageIcon status={s.id} className="size-4" />
                          <div>
                            <span className="text-sm font-medium text-slate-800">{s.label}</span>
                            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                              {s.tone}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {isFixed ? (
                            <span className="flex items-center gap-1 text-xs text-slate-400">
                              <Lock className="size-3" /> {s.kind === 'entry' ? 'entry' : s.kind}
                            </span>
                          ) : (
                            <>
                              {mgr && (
                                <div className="flex items-center">
                                  <button
                                    type="button"
                                    disabled={isFirst}
                                    onClick={() => moveStage.mutate({ id: s.id, by: -1 })}
                                    className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-800 disabled:opacity-20"
                                    title="Move left in Kanban"
                                  >
                                    <ChevronUp className="size-4" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isLast}
                                    onClick={() => moveStage.mutate({ id: s.id, by: 1 })}
                                    className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-800 disabled:opacity-20"
                                    title="Move right in Kanban"
                                  >
                                    <ChevronDown className="size-4" />
                                  </button>
                                </div>
                              )}
                              {mgr && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingStage(s)
                                    setEditStageLabel(s.label)
                                    setEditStageTone(s.tone)
                                    setAddingStage(false)
                                  }}
                                  className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-800"
                                  title="Edit stage"
                                >
                                  <Pencil className="size-3.5" />
                                </button>
                              )}
                              {mgr && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteStage(s)}
                                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                  title="Delete stage"
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </div>
          )}

          {/* TAB 2: CUSTOM KANBAN VIEWS */}
          {tab === 'views' && (
            <div className="space-y-6">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
                <h3 className="text-xs font-semibold text-emerald-900">Create a Customised Kanban View</h3>
                <p className="mt-1 text-xs text-slate-600">
                  Select which stage columns appear on your Kanban board. Useful for focused workflows like
                  Negotiations Only, New Inquiries, or Closed Deals.
                </p>

                <form onSubmit={handleSaveCustomView} className="mt-4 space-y-4">
                  <Field label="Custom View Name">
                    <input
                      value={newViewName}
                      onChange={e => setNewViewName(e.target.value)}
                      placeholder="e.g. Active Deals Only / High Priority Funnel"
                      required
                      className={inputCls}
                    />
                  </Field>

                  <div>
                    <label className="mb-2 block text-xs font-medium text-slate-700">
                      Select Columns to Show on Kanban:
                    </label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {stages.map(s => {
                        const checked = selectedStagesForView.includes(s.id)
                        return (
                          <button
                            type="button"
                            key={s.id}
                            onClick={() => toggleStageInViewBuilder(s.id)}
                            className={`flex items-center gap-2 rounded-lg border p-2.5 text-left text-xs transition ${
                              checked
                                ? 'border-emerald-500 bg-emerald-100/50 font-medium text-emerald-950 ring-1 ring-emerald-500'
                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {}}
                              className="size-3.5 rounded text-emerald-600 focus:ring-emerald-500"
                            />
                            <StageIcon status={s.id} className="size-3.5" />
                            <span className="truncate">{s.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="submit" className="text-xs">
                      <Plus className="size-3.5" /> Save Kanban View
                    </Button>
                  </div>
                </form>
              </div>

              {/* Saved custom views */}
              <div>
                <h4 className="mb-2 text-xs font-semibold text-slate-900">Your Saved Kanban Views</h4>
                {views.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center">
                    <p className="text-xs text-slate-500">
                      No custom views created yet. All standard stages are currently shown on the board.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {views.map(v => {
                      const isActive = activeViewId === v.id
                      return (
                        <div
                          key={v.id}
                          className={`flex items-center justify-between rounded-xl border p-3 transition ${
                            isActive
                              ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-slate-900">{v.name}</span>
                              {isActive && (
                                <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-medium text-white">
                                  Active View
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 text-xs text-slate-500">
                              Showing {v.visibleStages.length} column(s):{' '}
                              {v.visibleStages
                                .map(id => stages.find(s => s.id === id)?.label ?? id)
                                .join(', ')}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant={isActive ? 'secondary' : 'primary'}
                              onClick={() => {
                                onSelectView(isActive ? null : v.id)
                                onClose()
                              }}
                              className="text-xs"
                            >
                              <Eye className="size-3.5" />
                              {isActive ? 'Reset to All' : 'Apply View'}
                            </Button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCustomView(v.id)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              title="Delete custom view"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: MANAGE PIPELINES */}
          {tab === 'pipelines' && mgr && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Pipelines</h3>
                  <p className="text-xs text-slate-500">Create separate funnels for Rentals, Luxury Sales, Commercial, etc.</p>
                </div>
                {!isCreatingPipe && (
                  <Button onClick={() => setIsCreatingPipe(true)} className="text-xs">
                    <Plus className="size-3.5" /> New pipeline
                  </Button>
                )}
              </div>

              {/* Create pipeline form */}
              {isCreatingPipe && (
                <form
                  onSubmit={handleCreatePipeline}
                  className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-900">Create Pipeline</span>
                    <button
                      type="button"
                      onClick={() => setIsCreatingPipe(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <Field label="Pipeline Name" hint="Starts with New Lead, Won, and Lost stages automatically.">
                    <input
                      value={newPipeName}
                      onChange={e => setNewPipeName(e.target.value)}
                      placeholder="e.g. Commercial Leasing"
                      required
                      autoFocus
                      className={inputCls}
                    />
                  </Field>
                  <ErrorText error={createPipeline.error} />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setIsCreatingPipe(false)}
                      className="text-xs"
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createPipeline.isPending} className="text-xs">
                      {createPipeline.isPending ? 'Creating...' : 'Create pipeline'}
                    </Button>
                  </div>
                </form>
              )}

              {/* Pipeline List */}
              <div className="space-y-3">
                {pipelines.map(p => {
                  const isCurrent = p.id === activePipelineId
                  const isEditing = editingPipeId === p.id

                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      {isEditing ? (
                        <div className="flex flex-1 items-center gap-2">
                          <input
                            value={renamePipeName}
                            onChange={e => setRenamePipeName(e.target.value)}
                            className={inputCls}
                            autoFocus
                          />
                          <Button onClick={() => handleRenamePipeline(p.id)} className="text-xs">
                            Save
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => setEditingPipeId(null)}
                            className="text-xs"
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-semibold text-slate-900">{p.name}</h4>
                            {isCurrent && (
                              <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                                Current
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">
                            {p.stages.length} stages · {p.open_count} open leads ({p.lead_count} total)
                          </p>
                        </div>
                      )}

                      {!isEditing && (
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setSelectedPipelineId(p.id)
                              onSelectPipeline(p.id)
                              setTab('stages')
                            }}
                            className="text-xs"
                          >
                            <SlidersHorizontal className="size-3.5" /> Edit stages
                          </Button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPipeId(p.id)
                              setRenamePipeName(p.name)
                            }}
                            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            title="Rename pipeline"
                          >
                            <Pencil className="size-4" />
                          </button>
                          {pipelines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleDeletePipeline(p.id, p.name)}
                              className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              title="Delete pipeline"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-6 py-3">
          <p className="text-xs text-slate-500">
            {activeViewId
              ? `Filtered view active: ${views.find(v => v.id === activeViewId)?.name}`
              : 'Showing all default pipeline stages'}
          </p>
          <Button onClick={onClose} className="text-xs">
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}
