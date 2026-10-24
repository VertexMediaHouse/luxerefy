import { useMutation, useQuery } from '@tanstack/react-query'
import { db, respond, write } from '../../lib/mock/db'
import { canSeeLead, captureLead, findClash, isLost, isOpen, isWon, logActivity, parse99acres, uid, type CaptureInput } from '../../lib/rules'
import { useUser } from '../../lib/session'
import { stage, stageLabel } from '../../lib/stages'
import { dateTime } from '../../lib/format'
import { TASK_KIND_LABEL } from '../../lib/labels'
import type { Lead, LeadStatus, Profile, Property, TaskKind } from '../../lib/types'

const byNewest = (a: { created_at: string }, b: { created_at: string }) => b.created_at.localeCompare(a.created_at)

function join(l: Lead) {
  return {
    ...l,
    contact: db.contacts.find(c => c.id === l.contact_id)!,
    // A buyer is usually shown several places, so every linked property travels with the lead.
    properties: l.property_ids.map(id => db.properties.find(p => p.id === id)).filter((p): p is Property => !!p),
    activity_count: db.lead_activities.filter(a => a.lead_id === l.id).length,
    doc_count: db.documents.filter(d => d.lead_id === l.id).length,
    // The board card shows the next commitment, which is the thing you actually act on.
    next_task: db.tasks.filter(t => t.lead_id === l.id && t.status === 'pending').sort((a, b) => a.due_at.localeCompare(b.due_at))[0] ?? null,
  }
}
export type LeadRow = ReturnType<typeof join>

/** Headline for a lead in a list or card: the first property it is tied to, else free text. */
export const interestOf = (l: Pick<LeadRow, 'properties' | 'property_interest'>) =>
  l.properties[0]?.title ?? l.property_interest ?? null

/** RLS stand-in: leads the user may see. */
export const visibleLeads = (user: Profile) => db.leads.filter(l => canSeeLead(user, l))

export const activityFeed = (leadIds: Set<string>, limit?: number) =>
  db.lead_activities
    .filter(a => leadIds.has(a.lead_id))
    .reverse() // same-timestamp entries: latest inserted first (sort is stable)
    .sort(byNewest)
    .slice(0, limit)
    .map(a => ({
      ...a,
      actor: db.profiles.find(p => p.id === a.actor_id)?.full_name ?? null,
      lead: { id: a.lead_id, name: db.contacts.find(c => c.id === db.leads.find(l => l.id === a.lead_id)?.contact_id)?.name ?? '' },
    }))
export type FeedItem = ReturnType<typeof activityFeed>[number]

export function useLeads() {
  const user = useUser()
  return useQuery({ queryKey: ['leads', user.id], queryFn: () => respond(visibleLeads(user).map(join).sort(byNewest)) })
}

export function useLead(id: string) {
  const user = useUser()
  return useQuery({
    queryKey: ['lead', id, user.id],
    queryFn: () => {
      const l = db.leads.find(l => l.id === id)
      if (!l || !canSeeLead(user, l)) return respond(null)
      const mine = db.tasks.filter(t => t.lead_id === id && t.status !== 'cancelled')
      return respond({
        ...join(l),
        activities: activityFeed(new Set([id])),
        // Split for the follow-up panel: what is still owed, and what has already happened.
        tasks: mine.filter(t => t.status === 'pending').sort((a, b) => a.due_at.localeCompare(b.due_at)),
        doneTasks: mine.filter(t => t.status === 'done').sort((a, b) => b.due_at.localeCompare(a.due_at)),
      })
    },
  })
}

function ownLead(user: Profile, id: string) {
  const l = db.leads.find(l => l.id === id)
  if (!l || !canSeeLead(user, l)) throw new Error('Lead not found')
  return l
}

/**
 * One stage change, shared by the detail page's stepper and the board's drag-and-drop.
 * Dropping onto another pipeline's column moves the lead to that pipeline too.
 */
function applyStatus(user: Profile, id: string, status: LeadStatus, reason?: string) {
  const l = ownLead(user, id)
  if (l.status === status) return
  const now = new Date().toISOString()
  // Mirrors the partial unique index: one open lead per contact.
  if (!isOpen(l) && isOpen({ status }) && db.leads.some(o => o.id !== id && o.contact_id === l.contact_id && isOpen(o)))
    throw new Error('This contact already has another open lead.')
  logActivity(db, id, 'status_change', `Stage changed from ${stageLabel(l.status)} to ${stageLabel(status)}${reason ? ` — ${reason}` : ''}`, user.id, now)
  Object.assign(l, {
    status, pipeline_id: stage(status)?.pipeline_id ?? l.pipeline_id,
    lost_reason: isLost({ status }) ? reason ?? null : null, updated_at: now,
  })
  const contact = db.contacts.find(c => c.id === l.contact_id)
  if (isWon({ status }) && contact?.kind === 'lead') contact.kind = 'client'
}

/** Board drag-and-drop. Separate from useLeadActions because the card is not the open lead. */
export function useMoveLead() {
  const user = useUser()
  return useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: LeadStatus; reason?: string }) => write(() => applyStatus(user, id, status, reason)),
  })
}

export function useCreateLead() {
  const user = useUser()
  return useMutation({ mutationFn: (input: CaptureInput) => write(() => captureLead(db, input, user)) })
}

/**
 * Bulk import. captureLead already dedupes by phone and logs the activity, so a sheet row
 * takes the same path as a webhook lead: an existing open lead is merged, not duplicated.
 * One write() for the whole file, so the store is saved once.
 */
export function useImportLeads() {
  const user = useUser()
  return useMutation({
    mutationFn: (rows: CaptureInput[]) =>
      write(() => {
        let created = 0, merged = 0
        const failed: { row: number; error: string }[] = []
        rows.forEach((input, i) => {
          try { captureLead(db, input, user).created ? created++ : merged++ }
          catch (e) { failed.push({ row: i + 2, error: (e as Error).message }) }
        })
        return { created, merged, failed }
      }),
  })
}

/** Mock of POST /functions/v1/99acres-webhook: the payload is processed as the system, not the signed-in user. */
export function useSimulate99acres() {
  return useMutation({
    mutationFn: (raw: string) =>
      write(() => {
        let payload: unknown = raw
        try { payload = JSON.parse(raw) } catch { /* not JSON → treat as SMS text */ }
        const input = parse99acres(payload)
        if (!input) throw new Error('No phone number found in that message — the webhook would reject it (400).')
        return captureLead(db, input, null)
      }),
  })
}

export function useDeleteLead() {
  const user = useUser()
  return useMutation({
    mutationFn: (id: string) =>
      write(() => {
        const l = ownLead(user, id)
        db.leads = db.leads.filter(x => x.id !== id)
        db.lead_activities = db.lead_activities.filter(a => a.lead_id !== id)
        db.tasks = db.tasks.filter(t => t.lead_id !== id)
        db.documents = db.documents.filter(d => d.lead_id !== id)
        db.tickets = db.tickets.filter(t => t.lead_id !== id)
        return l
      }),
  })
}

export function useLeadActions(id: string) {
  const user = useUser()
  const now = () => new Date().toISOString()
  return {
    setStatus: useMutation({
      mutationFn: ({ status, reason }: { status: LeadStatus; reason?: string }) =>
        write(() => applyStatus(user, id, status, reason)),
    }),
    log: useMutation({
      mutationFn: ({ type, body }: { type: 'call' | 'note' | 'text'; body: string }) =>
        write(() => {
          ownLead(user, id).updated_at = now()
          logActivity(db, id, type, body, user.id, now())
        }),
    }),
    /** Free-text scratchpad. Replaces the whole field, so the textarea is the source of truth. */
    saveNotes: useMutation({
      mutationFn: (notes: string) =>
        write(() => {
          const l = ownLead(user, id)
          l.notes = notes
          l.updated_at = now()
        }),
    }),
    /** Link or unlink the properties this buyer is being shown. */
    setProperties: useMutation({
      mutationFn: (property_ids: string[]) =>
        write(() => {
          const l = ownLead(user, id)
          const before = new Set(l.property_ids)
          l.property_ids = [...new Set(property_ids)].filter(pid => db.properties.some(p => p.id === pid))
          l.updated_at = now()
          const added = l.property_ids.filter(pid => !before.has(pid))
          const removed = [...before].filter(pid => !l.property_ids.includes(pid))
          const title = (pid: string) => db.properties.find(p => p.id === pid)?.title ?? pid
          if (added.length) logActivity(db, id, 'note', `Property added: ${added.map(title).join(', ')}`, user.id, now())
          if (removed.length) logActivity(db, id, 'note', `Property removed: ${removed.map(title).join(', ')}`, user.id, now())
        }),
    }),
    /**
     * Book the next action. A timed kind (meeting, site visit) takes a slot, so it is
     * refused when it overlaps something already booked — same guard the calendar uses.
     */
    followUp: useMutation({
      mutationFn: ({ title, kind, due_at, ends_at }: { title: string; kind: TaskKind; due_at: string; ends_at?: string | null }) =>
        write(() => {
          const l = ownLead(user, id)
          const task = {
            id: uid(), title, kind, lead_id: id, property_id: l.property_ids[0] ?? null, assigned_to: l.assigned_to ?? user.id,
            due_at, ends_at: ends_at ?? null, status: 'pending' as const, created_by: user.id, created_at: now(),
          }
          const clash = findClash(db, task)
          if (clash) throw new Error(`That slot is already taken by "${clash.title}" at ${dateTime(clash.due_at)}. Pick another time.`)
          db.tasks.push(task)
          logActivity(db, id, 'follow_up', `${TASK_KIND_LABEL[kind]} scheduled: ${title} — ${dateTime(due_at)}`, user.id, now())
        }),
    }),
    completeTask: useMutation({
      mutationFn: (taskId: string) =>
        write(() => {
          ownLead(user, id)
          const t = db.tasks.find(t => t.id === taskId && t.lead_id === id)
          if (!t) throw new Error('Task not found')
          t.status = 'done'
          logActivity(db, id, 'follow_up', `Completed: ${t.title}`, user.id, now())
        }),
    }),
  }
}
