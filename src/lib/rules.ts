// Business rules shared by every lead entry point. These become the SQL functions
// capture_lead / escalate_overdue_tickets once Supabase is connected.
// Imports carry .ts so `npm run check` can run this file directly in Node.
import type { ActivityType, Goal, GoalPeriod, Lead, LeadSource, Profile, Tables, Task, Ticket, TicketPriority } from './types.ts'
import { SOURCE_LABEL } from './labels.ts'

export const uid = () => crypto.randomUUID()
export const isManager = (u: Pick<Profile, 'role'>) => u.role !== 'agent'
export const canSeeLead = (u: Profile, l: Pick<Lead, 'assigned_to'>) => isManager(u) || l.assigned_to === u.id

// Every pipeline gets the same three reserved stages, so their ids are derivable from the
// pipeline id and this file never has to read the stages table. A custom stage id is generated
// (stages.ts: newStageId) and so can never end in one of these suffixes.
// ponytail: id-suffix convention. If a pipeline ever needs two won-type stages, read Stage.kind
// from Tables here instead and pass `t` into isOpen.
export const entryOf = (pipelineId: string) => `${pipelineId}-new`
export const wonOf = (pipelineId: string) => `${pipelineId}-won`
export const lostOf = (pipelineId: string) => `${pipelineId}-lost`

export const isWonId = (id: string) => id.endsWith('-won')
export const isLostId = (id: string) => id.endsWith('-lost')
export const isTerminalId = (id: string) => isWonId(id) || isLostId(id)

export const isOpen = (l: Pick<Lead, 'status'>) => !isTerminalId(l.status)
export const isWon = (l: Pick<Lead, 'status'>) => isWonId(l.status)
export const isLost = (l: Pick<Lead, 'status'>) => isLostId(l.status)

/** Lowest position is the board new enquiries land in. */
export const defaultPipelineId = (t: Tables) =>
  [...t.pipelines].sort((a, b) => a.position - b.position)[0]?.id ?? 'pl-1'
export const canSeeTicket = (u: Profile, t: Pick<Ticket, 'raised_by' | 'assigned_to'>) => isManager(u) || t.raised_by === u.id || t.assigned_to === u.id
export const canSeeTask = (u: Profile, t: Pick<Task, 'assigned_to'>) => isManager(u) || t.assigned_to === u.id

/** The one person running this workspace. Everything new is assigned to them. */
export const soleOwner = (t: Tables) =>
  t.profiles.find(p => p.active && p.role === 'owner') ?? t.profiles.find(p => p.active) ?? null

/**
 * "Added by me": the lead's creation entry has a human actor rather than a webhook.
 * Derived on purpose — a `created_by` column would duplicate what the timeline already records.
 */
export const addedByMe = (t: Tables, leadId: string, userId: string) =>
  t.lead_activities.some(a => a.lead_id === leadId && a.type === 'created' && a.actor_id === userId)

/** Indian mobiles → +91XXXXXXXXXX, other "+<country>" numbers kept as E.164. null = invalid. */
export function normalizePhone(raw: string): string | null {
  const s = raw.trim()
  const d = s.replace(/\D/g, '')
  if (s.startsWith('+') && !s.startsWith('+91')) return d.length >= 8 && d.length <= 15 ? '+' + d : null
  const local = d.replace(/^(?:91|0)(?=\d{10}$)/, '')
  return /^[6-9]\d{9}$/.test(local) ? '+91' + local : null
}

export interface CaptureInput {
  name: string; phone: string; source: LeadSource; email?: string | null
  property_ids?: string[] | null
  pipeline_id?: string | null
  property_interest?: string | null; budget_min?: number | null; budget_max?: number | null; city?: string | null
  external_ref?: string | null; referral_detail?: string | null; message?: string | null; notes?: string | null
}

/** 99acres arrives as JSON (lead push / email parser) or a raw SMS body (SMS forwarder app). */
export function parse99acres(payload: unknown): CaptureInput | null {
  if (typeof payload === 'string') {
    const phone = payload.match(/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/)?.[0]
    if (!phone) return null
    const name = payload.match(/name\s*[:-]\s*([^\n,|]+)/i)?.[1] ?? payload.match(/(?:I am|I'm|this is)\s+([A-Z][a-z]+(?: [A-Z][a-z]+)?)/)?.[1]
    const interest = payload.match(/interested in\s+(?:your\s+|this\s+|the\s+)?(?:property\b\s*)?([^.\n?]*)/i)?.[1]
    return { name: name?.trim() || '99acres buyer', phone, source: '99acres', property_interest: interest?.trim() || null, message: payload.trim() }
  }
  if (payload && typeof payload === 'object') {
    const o = Object.fromEntries(Object.entries(payload).map(([k, v]) => [k.toLowerCase(), v]))
    const pick = (...keys: string[]) => {
      for (const k of keys) if (o[k] != null && String(o[k]).trim()) return String(o[k]).trim()
      return null
    }
    const phone = pick('phone', 'mobile', 'phone_number', 'mobile_number', 'contact')
    if (!phone) return null
    return {
      name: pick('name', 'lead_name', 'buyer_name') ?? '99acres buyer', phone, source: '99acres', email: pick('email'),
      property_interest: pick('project', 'property', 'property_name', 'interest'), city: pick('city'),
      external_ref: pick('lead_id', 'query_id', 'id'), message: pick('message', 'query', 'comments'),
    }
  }
  return null
}

export function logActivity(t: Tables, lead_id: string, type: ActivityType, body: string, actor_id: string | null, at: string, meta: Record<string, unknown> = {}) {
  t.lead_activities.push({ id: uid(), lead_id, type, body, meta, actor_id, created_at: at })
}

/** Single entry point for every new enquiry. Dedupes by phone: one open lead per contact. */
export function captureLead(t: Tables, input: CaptureInput, actor: Profile | null, at = new Date().toISOString()) {
  const phone = normalizePhone(input.phone)
  if (!phone) throw new Error('Enter a valid mobile number')
  const actorId = actor?.id ?? null
  const via = SOURCE_LABEL[input.source] + (input.message ? `: "${input.message}"` : '')

  let contact = t.contacts.find(c => c.phone === phone)
  if (!contact) {
    contact = { id: uid(), name: input.name.trim() || 'Unknown', phone, email: input.email?.trim() || null, kind: 'lead', created_by: actorId, created_at: at }
    t.contacts.push(contact)
  }

  const existing = t.leads.find(l => l.contact_id === contact.id && isOpen(l))
  if (existing) {
    existing.updated_at = at
    logActivity(t, existing.id, 'enquiry', `Enquired again via ${via}`, actorId, at)
    return { lead: existing, created: false }
  }

  const pipeline_id = input.pipeline_id || defaultPipelineId(t)
  const owner = soleOwner(t)
  const lead: Lead = {
    id: uid(), contact_id: contact.id, source: input.source, pipeline_id, status: entryOf(pipeline_id),
    property_ids: (input.property_ids ?? []).filter(Boolean),
    property_interest: input.property_interest ?? null, budget_min: input.budget_min ?? null, budget_max: input.budget_max ?? null,
    city: input.city ?? null, external_ref: input.external_ref ?? null,
    referral_detail: input.source === 'referral' ? input.referral_detail?.trim() || null : null,
    notes: input.notes?.trim() ?? '',
    lost_reason: null, created_at: at, updated_at: at,
    assigned_to: owner?.id ?? null,
  }
  t.leads.push(lead)
  logActivity(t, lead.id, 'created', `Lead captured from ${via}`, actorId, at)

  // Portal leads get a first call booked for the next morning so nothing sits untouched.
  if (input.source === '99acres' && lead.assigned_to) {
    const due = new Date(at)
    due.setDate(due.getDate() + 1)
    due.setHours(10, 0, 0, 0)
    t.tasks.push({
      id: uid(), title: `Call ${contact.name} (99acres)`, kind: 'call', lead_id: lead.id, property_id: lead.property_ids[0] ?? null,
      assigned_to: lead.assigned_to, due_at: due.toISOString(), ends_at: null, status: 'pending', created_by: null, created_at: at,
    })
    logActivity(t, lead.id, 'follow_up', `Follow-up scheduled for ${due.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`, null, at)
  }
  return { lead, created: true }
}

/** Mirrors the tasks EXCLUDE constraint: timed, non-cancelled entries can't overlap for the same person. */
export function findClash(t: Tables, task: Pick<Task, 'id' | 'assigned_to' | 'due_at' | 'ends_at' | 'status'>) {
  if (!task.ends_at || task.status === 'cancelled') return null
  const s = Date.parse(task.due_at), e = Date.parse(task.ends_at)
  return t.tasks.find(o => o.id !== task.id && o.assigned_to === task.assigned_to && o.ends_at && o.status !== 'cancelled' && Date.parse(o.due_at) < e && s < Date.parse(o.ends_at)) ?? null
}

/**
 * Ids of timed entries that overlap at least one other, so the calendar can flag a
 * double-booked slot that pre-dates the guard (seeded or imported data).
 * ponytail: O(n²) over the visible window only. Sweep by start time if a year ever renders at once.
 */
export function overlappingIds(tasks: Pick<Task, 'id' | 'assigned_to' | 'due_at' | 'ends_at' | 'status'>[]) {
  const timed = tasks.filter(t => t.ends_at && t.status !== 'cancelled')
  const hit = new Set<string>()
  for (const a of timed)
    for (const b of timed) {
      if (a.id === b.id || a.assigned_to !== b.assigned_to) continue
      if (Date.parse(a.due_at) < Date.parse(b.ends_at!) && Date.parse(b.due_at) < Date.parse(a.ends_at!)) { hit.add(a.id); hit.add(b.id) }
    }
  return hit
}

/** Start (inclusive) and end (exclusive) of the week, month or year currently in progress. */
export function periodRange(period: GoalPeriod, now = new Date()) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  if (period === 'weekly') start.setDate(start.getDate() - ((start.getDay() + 6) % 7)) // Monday
  if (period === 'monthly') start.setDate(1)
  if (period === 'yearly') { start.setMonth(0); start.setDate(1) }
  const end = new Date(start)
  if (period === 'weekly') end.setDate(end.getDate() + 7)
  if (period === 'monthly') end.setMonth(end.getMonth() + 1)
  if (period === 'yearly') end.setFullYear(end.getFullYear() + 1)
  return { start, end }
}

/**
 * What has actually happened against a goal inside the period in progress.
 * ponytail: a won lead is dated by `updated_at`, since the stage change is its last write.
 * Add a `won_at` column if a lead can be edited after closing.
 */
export function goalProgress(t: Tables, goal: Pick<Goal, 'period' | 'metric'>, now = new Date()) {
  const { start, end } = periodRange(goal.period, now)
  const within = (iso: string) => { const d = Date.parse(iso); return d >= start.getTime() && d < end.getTime() }
  if (goal.metric === 'leads') return t.leads.filter(l => within(l.created_at)).length
  if (goal.metric === 'won') return t.leads.filter(l => isWon(l) && within(l.updated_at)).length
  if (goal.metric === 'revenue') return t.leads.filter(l => isWon(l) && within(l.updated_at)).reduce((v, l) => v + (l.budget_max ?? l.budget_min ?? 0), 0)
  return t.tasks.filter(k => k.kind === 'site_visit' && k.status === 'done' && within(k.due_at)).length
}

export const SLA_HOURS: Record<TicketPriority, number> = { urgent: 4, high: 24, normal: 48, low: 72 }
export const slaDue = (createdAt: string, p: TicketPriority) => new Date(Date.parse(createdAt) + SLA_HOURS[p] * 3600e3).toISOString()

/** The pg_cron job: past SLA → level 1, another full SLA window past → level 2. One desk, so it stays there. */
export function escalateTickets(t: Tables, at = new Date().toISOString()) {
  const owner = soleOwner(t)
  let changed = 0
  for (const tk of t.tickets) {
    if (tk.status === 'resolved') continue
    const over = Date.parse(at) - Date.parse(tk.sla_due_at)
    const level = over <= 0 ? 0 : over > SLA_HOURS[tk.priority] * 3600e3 ? 2 : 1
    if (level <= tk.escalation_level) continue
    tk.escalation_level = level
    tk.escalated_at = at
    tk.assigned_to = owner?.id ?? tk.assigned_to
    changed++
  }
  return changed
}
