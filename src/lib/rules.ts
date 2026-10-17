// Business rules shared by every lead entry point. These become the SQL functions
// capture_lead / pick_agent / escalate_overdue_tickets once Supabase is connected.
// Imports carry .ts so `npm run check` can run this file directly in Node.
import type { ActivityType, Lead, LeadSource, Profile, Tables, Task, Ticket, TicketPriority } from './types.ts'
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

/** Indian mobiles → +91XXXXXXXXXX, other "+<country>" numbers kept as E.164. null = invalid. */
export function normalizePhone(raw: string): string | null {
  const s = raw.trim()
  const d = s.replace(/\D/g, '')
  if (s.startsWith('+') && !s.startsWith('+91')) return d.length >= 8 && d.length <= 15 ? '+' + d : null
  const local = d.replace(/^(?:91|0)(?=\d{10}$)/, '')
  return /^[6-9]\d{9}$/.test(local) ? '+91' + local : null
}

export interface CaptureInput {
  name: string; phone: string; source: LeadSource; email?: string | null; property_id?: string | null
  pipeline_id?: string | null
  property_interest?: string | null; budget_min?: number | null; budget_max?: number | null; city?: string | null
  external_ref?: string | null; message?: string | null; assign_to?: string | null
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

/** Active agent with the fewest open leads; owner if there are no agents. */
export function pickAgent(t: Tables): string | null {
  const open = (id: string) => t.leads.filter(l => l.assigned_to === id && isOpen(l)).length
  const agents = t.profiles.filter(p => p.active && p.role === 'agent').sort((a, b) => open(a.id) - open(b.id))
  return agents[0]?.id ?? t.profiles.find(p => p.role === 'owner')?.id ?? null
}

export const FOLLOW_UP_TEMPLATE = 'property_enquiry_followup'

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
  const lead: Lead = {
    id: uid(), contact_id: contact.id, source: input.source, pipeline_id, status: entryOf(pipeline_id), property_id: input.property_id ?? null,
    property_interest: input.property_interest ?? null, budget_min: input.budget_min ?? null, budget_max: input.budget_max ?? null,
    city: input.city ?? null, external_ref: input.external_ref ?? null, lost_reason: null, created_at: at, updated_at: at,
    // Agents can only create leads for themselves (RLS with-check on assigned_to).
    assigned_to: actor && !isManager(actor) ? actor.id : input.assign_to || pickAgent(t),
  }
  t.leads.push(lead)
  logActivity(t, lead.id, 'created', `Lead captured from ${via}`, actorId, at)
  const agent = t.profiles.find(p => p.id === lead.assigned_to)
  if (agent) logActivity(t, lead.id, 'assignment', `Assigned to ${agent.full_name}`, actorId, at)

  if (input.source === '99acres') {
    logActivity(t, lead.id, 'whatsapp', `Auto follow-up template "${FOLLOW_UP_TEMPLATE}" sent on WhatsApp`, null, at, { template: FOLLOW_UP_TEMPLATE, direction: 'out', status: 'sent', wa_id: 'wamid.' + uid() })
    if (lead.assigned_to) {
      const due = new Date(at)
      due.setDate(due.getDate() + 1)
      due.setHours(10, 0, 0, 0)
      t.tasks.push({
        id: uid(), title: `Call ${contact.name} (99acres)`, kind: 'follow_up', lead_id: lead.id, property_id: lead.property_id,
        assigned_to: lead.assigned_to, due_at: due.toISOString(), ends_at: null, status: 'pending', created_by: null, created_at: at,
      })
      logActivity(t, lead.id, 'follow_up', `Follow-up scheduled for ${due.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`, null, at)
    }
  }
  return { lead, created: true }
}

/** Mirrors the tasks EXCLUDE constraint: timed, non-cancelled entries can't overlap for the same person. */
export function findClash(t: Tables, task: Pick<Task, 'id' | 'assigned_to' | 'due_at' | 'ends_at' | 'status'>) {
  if (!task.ends_at || task.status === 'cancelled') return null
  const s = Date.parse(task.due_at), e = Date.parse(task.ends_at)
  return t.tasks.find(o => o.id !== task.id && o.assigned_to === task.assigned_to && o.ends_at && o.status !== 'cancelled' && Date.parse(o.due_at) < e && s < Date.parse(o.ends_at)) ?? null
}

/** Minimal shape of Meta's WhatsApp Business webhook payload. */
export interface WaPayload {
  entry?: { changes?: { value?: {
    contacts?: { wa_id: string; profile?: { name?: string } }[]
    messages?: { id: string; from: string; type: string; text?: { body: string } }[]
  } }[] }[]
}

export function parseWhatsApp(payload: WaPayload) {
  return (payload.entry ?? []).flatMap(e => (e.changes ?? []).flatMap(({ value: v = {} }) => (v.messages ?? []).map(m => ({
    wa_id: m.id, phone: '+' + m.from, text: m.text?.body ?? `[${m.type}]`,
    name: v.contacts?.find(c => c.wa_id === m.from)?.profile?.name ?? 'WhatsApp contact',
  }))))
}

/** Inbound message → existing open lead's timeline, or a new WhatsApp lead. Idempotent on wa_id. */
export function receiveWhatsApp(t: Tables, msg: ReturnType<typeof parseWhatsApp>[number], at = new Date().toISOString()) {
  if (t.lead_activities.some(a => a.meta.wa_id === msg.wa_id)) return { duplicate: true as const }
  const phone = normalizePhone(msg.phone)
  if (!phone) throw new Error(`Invalid WhatsApp number ${msg.phone}`)
  const contact = t.contacts.find(c => c.phone === phone)
  let lead = contact && t.leads.find(l => l.contact_id === contact.id && isOpen(l))
  let created = false
  if (!lead) ({ lead, created } = captureLead(t, { name: msg.name, phone, source: 'whatsapp' }, null, at))
  logActivity(t, lead.id, 'whatsapp', `WhatsApp received: "${msg.text}"`, null, at, { wa_id: msg.wa_id, direction: 'in' })
  return { duplicate: false as const, lead, created }
}

export const SLA_HOURS: Record<TicketPriority, number> = { urgent: 4, high: 24, normal: 48, low: 72 }
export const slaDue = (createdAt: string, p: TicketPriority) => new Date(Date.parse(createdAt) + SLA_HOURS[p] * 3600e3).toISOString()

/** The pg_cron job: past SLA → level 1 (manager); another full SLA window past → level 2 (owner). */
export function escalateTickets(t: Tables, at = new Date().toISOString()) {
  const manager = t.profiles.find(p => p.active && p.role === 'manager')
  const owner = t.profiles.find(p => p.role === 'owner')
  let changed = 0
  for (const tk of t.tickets) {
    if (tk.status === 'resolved') continue
    const over = Date.parse(at) - Date.parse(tk.sla_due_at)
    const level = over <= 0 ? 0 : over > SLA_HOURS[tk.priority] * 3600e3 ? 2 : 1
    if (level <= tk.escalation_level) continue
    tk.escalation_level = level
    tk.escalated_at = at
    tk.assigned_to = (level === 1 ? manager ?? owner : owner)?.id ?? tk.assigned_to
    changed++
  }
  return changed
}
