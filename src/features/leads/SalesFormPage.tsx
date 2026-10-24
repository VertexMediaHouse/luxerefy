import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { Building2, CheckCircle2, Mail, MapPin, Phone, Send, Sparkles, User } from 'lucide-react'
import { Brand } from '../../components/Layout'
import { Badge, Button } from '../../components/ui'
import { inr } from '../../lib/format'
import { PROPERTY_STATUS_LABEL, PROPERTY_STATUS_TONE } from '../../lib/labels'
import { db, write } from '../../lib/mock/db'
import { captureLead } from '../../lib/rules'
import type { LeadSource } from '../../lib/types'

const BUDGET_PRESETS = [
  { label: 'Under ₹2 Cr', min: null, max: 2e7 },
  { label: '₹2 – ₹5 Cr', min: 2e7, max: 5e7 },
  { label: '₹5 – ₹10 Cr', min: 5e7, max: 1e8 },
  { label: '₹10 Cr+', min: 1e8, max: null },
]

export function SalesFormPage() {
  const [params] = useSearchParams()

  // Dynamic link parameters
  const refTag = params.get('ref')?.trim() || ''
  const sourceParam = (params.get('source')?.trim() || 'sales_form') as LeadSource
  const propIdOrSlug = params.get('prop')?.trim() || ''
  const agentId = params.get('agent')?.trim() || ''
  const pipelineId = params.get('pipe')?.trim() || ''

  // Look up pre-selected property
  const targetProperty = db.properties.find(p => p.id === propIdOrSlug || p.slug === propIdOrSlug) || null

  // State
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [selectedPropertyId, setSelectedPropertyId] = useState(targetProperty ? targetProperty.id : '')
  const [customInterest, setCustomInterest] = useState('')
  const [city, setCity] = useState(targetProperty?.city || 'Ahmedabad')
  const [locality, setLocality] = useState(targetProperty?.locality || '')
  const [selectedBudget, setSelectedBudget] = useState<number | null>(null)
  const [notes, setNotes] = useState('')

  const [done, setDone] = useState(false)
  const [submittedName, setSubmittedName] = useState('')
  const [submittedPhone, setSubmittedPhone] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  // Live active properties for the dropdown
  const activeProperties = db.properties.filter(p => p.status !== 'sold' && p.is_public)
  const chosenProperty = db.properties.find(p => p.id === selectedPropertyId) || targetProperty

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setBusy(true)
    setErr('')

    const budgetConfig = selectedBudget !== null ? BUDGET_PRESETS[selectedBudget] : null
    const propIds = chosenProperty ? [chosenProperty.id] : []
    const headlineInterest = chosenProperty
      ? `${chosenProperty.title} (${chosenProperty.config})`
      : customInterest.trim() || 'Luxury Property'

    // Form tracking message for timeline
    const trackingTag = refTag ? `Campaign / Referral: ${refTag}` : 'Direct public form'
    const fullNotes = [notes.trim(), `[Captured via public link · ${trackingTag}]`].filter(Boolean).join('\n\n')

    try {
      await write(() =>
        captureLead(
          db,
          {
            name: name.trim(),
            phone: phone.trim(),
            email: email.trim() || null,
            source: sourceParam,
            referral_detail: refTag || (sourceParam === 'referral' || sourceParam === 'sales_form' ? 'Sales Form' : null),
            property_ids: propIds,
            property_interest: headlineInterest,
            budget_min: budgetConfig?.min ?? null,
            budget_max: budgetConfig?.max ?? null,
            city: city.trim() || null,
            notes: fullNotes,
            message: `Public form enquiry for ${headlineInterest}`,
            assigned_to: agentId || null,
            pipeline_id: pipelineId || null,
          },
          null,
        ),
      )
      setSubmittedName(name)
      setSubmittedPhone(phone)
      setDone(true)
    } catch (ex) {
      setErr((ex as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const resetForm = () => {
    setName('')
    setPhone('')
    setEmail('')
    setNotes('')
    setCustomInterest('')
    setSelectedBudget(null)
    setDone(false)
  }

  if (done) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200/80 bg-white p-8 text-center shadow-xl">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/50">
            <CheckCircle2 className="size-10" />
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            <Sparkles className="size-3.5" /> Enquiry Received
          </span>

          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
            Thank you, {submittedName}!
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Your enquiry has been successfully registered. One of our senior luxury real estate advisors
            will connect with you on <span className="font-semibold text-slate-900">{submittedPhone}</span> to assist with your requirements.
          </p>

          {chosenProperty && (
            <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50/80 p-3.5 text-left">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Property Enquired</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">{chosenProperty.title}</p>
              <p className="text-xs text-slate-500">{chosenProperty.locality} · {inr(chosenProperty.price)}</p>
            </div>
          )}

          <div className="mt-8 flex justify-center gap-3">
            <Button variant="secondary" onClick={resetForm}>
              Submit Another Enquiry
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-slate-100 to-slate-50 py-10 px-4 sm:px-6">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-6 flex items-center justify-between">
          <Brand />
          {refTag && (
            <span className="rounded-full bg-slate-200/80 px-2.5 py-1 text-xs font-medium text-slate-700">
              {refTag}
            </span>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xl shadow-slate-200/50">
          {/* Header Banner */}
          <div className="border-b border-slate-100 bg-ink px-6 py-8 text-white sm:px-8">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-blue-300">
              <Sparkles className="size-3.5" /> Exclusive Portfolio
            </span>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Express Your Interest
            </h1>
            <p className="mt-1.5 text-sm text-slate-300">
              Share your preferences and requirements. Our luxury real estate advisory team will curate the finest matches for you.
            </p>
          </div>

          {/* Featured Property Hero if present */}
          {targetProperty && (
            <div className="border-b border-slate-100 bg-blue-50/40 p-4 sm:p-5">
              <div className="flex gap-4">
                {targetProperty.images[0] && (
                  <img
                    src={targetProperty.images[0]}
                    alt={targetProperty.title}
                    className="size-20 shrink-0 rounded-lg object-cover shadow-sm sm:size-24"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-blue-700 uppercase tracking-wide">Featured Listing</span>
                    <Badge tone={PROPERTY_STATUS_TONE[targetProperty.status]}>
                      {PROPERTY_STATUS_LABEL[targetProperty.status]}
                    </Badge>
                  </div>
                  <h3 className="mt-1 truncate text-base font-semibold text-slate-900">
                    {targetProperty.title}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {targetProperty.locality} · {targetProperty.config} · {targetProperty.area_sqft.toLocaleString('en-IN')} sq ft
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-900">
                    {inr(targetProperty.price)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={submit} className="space-y-5 p-6 sm:p-8">
            <div className="space-y-4">
              <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                Contact Details
              </h2>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-medium text-slate-700">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="e.g. Siddharth Mehta"
                      className="block w-full rounded-lg border border-slate-300 py-2.5 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700">
                    Mobile Number <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="block w-full rounded-lg border border-slate-300 py-2.5 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700">
                    Email Address <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      className="block w-full rounded-lg border border-slate-300 py-2.5 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4 pt-2 border-t border-slate-100">
              <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                Property Preferences
              </h2>

              {!targetProperty && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700">
                    Select Property or Project of Interest
                  </label>
                  <div className="relative">
                    <Building2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                    <select
                      value={selectedPropertyId}
                      onChange={e => setSelectedPropertyId(e.target.value)}
                      className="block w-full rounded-lg border border-slate-300 py-2.5 pr-3 pl-9 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
                    >
                      <option value="">Other / General Requirement</option>
                      {activeProperties.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.title} · {p.locality} ({inr(p.price)})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {(!targetProperty || !selectedPropertyId) && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700">
                    Looking For / Configuration
                  </label>
                  <input
                    type="text"
                    value={customInterest}
                    onChange={e => setCustomInterest(e.target.value)}
                    placeholder="e.g. 4 BHK Penthouse, 5 BHK Bungalow, Weekend Villa"
                    className="block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
                  />
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700">
                    Preferred Locality / Area
                  </label>
                  <div className="relative">
                    <MapPin className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={locality}
                      onChange={e => setLocality(e.target.value)}
                      placeholder="e.g. Sindhu Bhavan, Bodakdev"
                      className="block w-full rounded-lg border border-slate-300 py-2.5 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700">
                    City
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    placeholder="e.g. Ahmedabad"
                    className="block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">
                  Approximate Budget Range
                </label>
                <div className="flex flex-wrap gap-2">
                  {BUDGET_PRESETS.map((b, idx) => (
                    <button
                      key={b.label}
                      type="button"
                      onClick={() => setSelectedBudget(selectedBudget === idx ? null : idx)}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                        selectedBudget === idx
                          ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">
                  Specific Requirements or Notes
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. High floor preference, vastu compliant, private pool, possession within 6 months…"
                  className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
                />
              </div>
            </div>

            {err && (
              <div className="rounded-lg bg-red-50 p-3 text-xs font-medium text-red-700 ring-1 ring-red-200">
                {err}
              </div>
            )}

            <Button
              type="submit"
              disabled={busy}
              className="w-full justify-center py-3 text-sm font-semibold shadow-md"
            >
              <Send className="size-4" />
              {busy ? 'Registering Enquiry…' : 'Submit Enquiry'}
            </Button>

            <p className="text-center text-[11px] text-slate-400">
              Your details are kept strictly confidential and shared only with our verified luxury advisory team.
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
