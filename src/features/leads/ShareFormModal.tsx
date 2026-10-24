import { useState } from 'react'
import { Check, Copy, ExternalLink, Link2, MessageSquare, Sparkles } from 'lucide-react'
import { Button, Field, inputCls, Modal } from '../../components/ui'
import { SOURCE_LABEL } from '../../lib/labels'
import { useProfiles } from '../../lib/session'
import type { LeadSource } from '../../lib/types'
import { usePipelines } from '../pipeline/api'
import { useProperties } from '../properties/api'

type ShareFormModalProps = {
  open: boolean
  onClose: () => void
}

const PRESETS = [
  { label: 'General Form', ref: '', source: 'sales_form' as LeadSource },
  { label: 'Instagram Ad', ref: 'Instagram Campaign', source: 'social_media' as LeadSource },
  { label: 'WhatsApp Share', ref: 'WhatsApp Broadcast', source: 'sales_form' as LeadSource },
  { label: 'Channel Partner', ref: 'Channel Partner', source: 'referral' as LeadSource },
  { label: 'Luxury Expo', ref: 'Property Expo 2026', source: 'walk_in' as LeadSource },
]

export function ShareFormModal({ open, onClose }: ShareFormModalProps) {
  const { data: properties = [] } = useProperties()
  const { data: profiles = [] } = useProfiles()
  const { data: pipelines = [] } = usePipelines()

  const [refTag, setRefTag] = useState('')
  const [source, setSource] = useState<LeadSource>('sales_form')
  const [propertyId, setPropertyId] = useState<string>('')
  const [agentId, setAgentId] = useState<string>('')
  const [pipelineId, setPipelineId] = useState<string>('')
  const [copied, setCopied] = useState(false)

  // Active properties only for the selector
  const activeProperties = properties.filter(p => p.status !== 'sold')
  const activeProfiles = profiles.filter(p => p.active)

  // Construct dynamic URL
  const params = new URLSearchParams()
  if (refTag.trim()) params.set('ref', refTag.trim())
  if (source && source !== 'sales_form') params.set('source', source)
  if (propertyId) params.set('prop', propertyId)
  if (agentId) params.set('agent', agentId)
  if (pipelineId) params.set('pipe', pipelineId)

  const queryString = params.toString()
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const dynamicUrl = `${origin}/sales-form${queryString ? `?${queryString}` : ''}`

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(dynamicUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      prompt('Copy this dynamic link:', dynamicUrl)
    }
  }

  const shareWhatsApp = () => {
    const text = `Hello! Please share your luxury property requirements with us here: ${dynamicUrl}`
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank')
  }

  const applyPreset = (preset: typeof PRESETS[number]) => {
    setRefTag(preset.ref)
    setSource(preset.source)
  }

  return (
    <Modal open={open} onClose={onClose} title="Share Public Lead Form" wide>
      <div className="space-y-6">
        <div>
          <p className="text-sm text-slate-500">
            Generate a personalized, trackable public form link. Anyone with this link can submit their details,
            and the enquiry will be captured directly into your CRM pipeline with full tracking attribution.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-slate-400">Quick presets:</span>
            {PRESETS.map(p => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                  refTag === p.ref && source === p.source
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Campaign / Referral Tag"
            hint="Identifies which campaign, partner, or channel sent this lead"
          >
            <input
              value={refTag}
              onChange={e => setRefTag(e.target.value)}
              className={inputCls}
              placeholder="e.g. Instagram Ad, Broker Rohit, Spring Expo"
            />
          </Field>

          <Field label="Lead Source" hint="How this lead will be tagged in the CRM">
            <select
              value={source}
              onChange={e => setSource(e.target.value as LeadSource)}
              className={inputCls}
            >
              {Object.entries(SOURCE_LABEL).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </Field>

          <Field label="Pre-selected Property (Optional)" hint="Featured at the top of the prospect's form">
            <select
              value={propertyId}
              onChange={e => setPropertyId(e.target.value)}
              className={inputCls}
            >
              <option value="">Any property (Prospect chooses / specifies)</option>
              {activeProperties.map(p => (
                <option key={p.id} value={p.id}>
                  {p.title} · {p.locality}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Auto-assign to Agent (Optional)" hint="Directs captured leads to a specific team member">
            <select
              value={agentId}
              onChange={e => setAgentId(e.target.value)}
              className={inputCls}
            >
              <option value="">Default (Workspace Owner)</option>
              {activeProfiles.map(p => (
                <option key={p.id} value={p.id}>
                  {p.full_name} ({p.role})
                </option>
              ))}
            </select>
          </Field>

          {pipelines.length > 1 && (
            <Field label="Target Pipeline (Optional)" className="sm:col-span-2">
              <select
                value={pipelineId}
                onChange={e => setPipelineId(e.target.value)}
                className={inputCls}
              >
                <option value="">Default pipeline ({pipelines[0]?.name})</option>
                {pipelines.map(pipe => (
                  <option key={pipe.id} value={pipe.id}>{pipe.name}</option>
                ))}
              </select>
            </Field>
          )}
        </div>

        {/* Dynamic Link Display Box */}
        <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-900">
              <Sparkles className="size-3.5 text-blue-600" />
              <span>Generated Dynamic Link</span>
            </div>
            {refTag && (
              <span className="rounded bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                Tracked: {refTag}
              </span>
            )}
          </div>

          <div className="mt-2.5 flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 overflow-hidden rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-800 shadow-sm">
              <Link2 className="size-4 shrink-0 text-slate-400" />
              <span className="truncate">{dynamicUrl}</span>
            </div>
            <Button
              type="button"
              onClick={copyLink}
              className={`shrink-0 ${copied ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
            >
              {copied ? (
                <>
                  <Check className="size-4" /> Copied!
                </>
              ) : (
                <>
                  <Copy className="size-4" /> Copy Link
                </>
              )}
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-blue-100 pt-3">
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={shareWhatsApp}
                className="gap-1.5 text-xs text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
              >
                <MessageSquare className="size-3.5 text-emerald-600" /> Share on WhatsApp
              </Button>
              <a
                href={dynamicUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <ExternalLink className="size-3.5 text-slate-500" /> Open Preview
              </a>
            </div>

            <p className="text-[11px] text-slate-500">
              Submissions automatically deduplicate by phone number.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  )
}
