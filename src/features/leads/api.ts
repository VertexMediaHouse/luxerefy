import { useMutation, useQuery } from '@tanstack/react-query'
import { captureRemote, db, ok, respond, write } from '../../lib/db'
import { supabase } from '../../lib/supabase'
import { canSeeLead, findClash, isLost, isOpen, isWon, uid, type CaptureInput } from '../../lib/rules'
import { useUser } from '../../lib/session'
import { stage, stageLabel } from '../../lib/stages'
import { dateTime } from '../../lib/format'
import { TASK_KIND_LABEL } from '../../lib/labels'
import type { ActivityType, Lead, LeadStatus, LeadType, Profile, Property, TaskKind } from '../../lib/types'

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

/** The timeline insert, server side. Mirrors logActivity in rules.ts, which now only runs in the check. */
const logRemote = (lead_id: string, type: ActivityType, body: string, actor_id: string | null, meta: Record<string, unknown> = {}) =>
  supabase.from('lead_activities').insert({ lead_id, type, body, meta, actor_id }).then(ok)

function ownLead(user: Profile, id: string) {
  const l = db.leads.find(l => l.id === id)
  if (!l || !canSeeLead(user, l)) throw new Error('Lead not found')
  return l
}

/**
 * One stage change, shared by the detail page's stepper and the board's drag-and-drop.
 * Dropping onto another pipeline's column moves the lead to that pipeline too.
 */
async function applyStatus(user: Profile, id: string, status: LeadStatus, reason?: string) {
  const l = ownLead(user, id)
  if (l.status === status) return
  // Mirrors the partial unique index: one open lead per contact. Checked here for the clearer message;
  // the index is still the thing that actually enforces it.
  if (!isOpen(l) && isOpen({ status }) && db.leads.some(o => o.id !== id && o.contact_id === l.contact_id && isOpen(o)))
    throw new Error('This contact already has another open lead.')
  await logRemote(id, 'status_change', `Stage changed from ${stageLabel(l.status)} to ${stageLabel(status)}${reason ? ` — ${reason}` : ''}`, user.id)
  ok(await supabase.from('leads').update({
    status, pipeline_id: stage(status)?.pipeline_id ?? l.pipeline_id,
    lost_reason: isLost({ status }) ? reason ?? null : null,
  }).eq('id', id))
  const contact = db.contacts.find(c => c.id === l.contact_id)
  if (isWon({ status }) && contact?.kind === 'lead')
    ok(await supabase.from('contacts').update({ kind: 'client' }).eq('id', contact.id))
}

/** Board drag-and-drop. Separate from useLeadActions because the card is not the open lead. */
export function useMoveLead() {
  const user = useUser()
  return useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: LeadStatus; reason?: string }) => write(() => applyStatus(user, id, status, reason)),
  })
}

/** Server-side capture (capture_leads RPC): dedupes by phone, logs the activity, books the 99acres call. */
async function capture(input: CaptureInput) {
  const [r] = await captureRemote([input])
  if (r.error !== undefined) throw new Error(r.error)
  // An agent may not see a lead that got assigned to someone else, so fall back to just its id.
  return { lead: db.leads.find(l => l.id === r.id) ?? ({ id: r.id } as Lead), created: r.created }
}

export function useCreateLead() {
  return useMutation({ mutationFn: capture })
}

/**
 * Bulk import. Every row takes the same server path as a webhook lead: an existing open lead
 * is merged, not duplicated. One RPC call for the whole file.
 */
export function useImportLeads() {
  return useMutation({
    mutationFn: async (rows: CaptureInput[]) => {
      let created = 0, merged = 0
      const failed: { row: number; error: string }[] = []
      ;(await captureRemote(rows)).forEach((r, i) => {
        if (r.error !== undefined) failed.push({ row: i + 2, error: r.error })
        else if (r.created) created++
        else merged++
      })
      return { created, merged, failed }
    },
  })
}

export function useDeleteLead() {
  const user = useUser()
  return useMutation({
    mutationFn: (id: string) =>
      write(async () => {
        const l = ownLead(user, id)
        // activities, tasks, documents and tickets all hang off leads with on delete cascade / set null.
        ok(await supabase.from('leads').delete().eq('id', id))
        return l
      }),
  })
}

export function useLeadActions(id: string) {
  const user = useUser()
  /** Bump the lead so "last activity" sorting stays honest. The set_leads_updated_at trigger supplies now(). */
  const touch = async () => ok(await supabase.from('leads').update({ updated_at: new Date().toISOString() }).eq('id', id))
  return {
    setStatus: useMutation({
      mutationFn: ({ status, reason }: { status: LeadStatus; reason?: string }) =>
        write(() => applyStatus(user, id, status, reason)),
    }),
    log: useMutation({
      mutationFn: ({ type, body }: { type: 'call' | 'note' | 'text'; body: string }) =>
        write(async () => {
          ownLead(user, id)
          await logRemote(id, type, body, user.id)
          await touch()
        }),
    }),
    /** Free-text scratchpad. Replaces the whole field, so the textarea is the source of truth. */
    saveNotes: useMutation({
      mutationFn: (notes: string) =>
        write(async () => {
          ownLead(user, id)
          ok(await supabase.from('leads').update({ notes }).eq('id', id))
        }),
    }),
    /** Update profile and requirement details (looking for, locality, project, type, budget, etc). */
    updateDetails: useMutation({
      mutationFn: (data: {
        property_interest?: string | null
        locality?: string | null
        project?: string | null
        lead_type?: LeadType | null
        budget_min?: number | null
        budget_max?: number | null
        city?: string | null
        name?: string
        phone?: string
        email?: string | null
      }) =>
        write(async () => {
          const l = ownLead(user, id)
          const { name, phone, email, ...lead } = data
          // Only the keys actually supplied travel, so a blank form field never wipes a stored value.
          const patch = Object.fromEntries(Object.entries(lead).filter(([, v]) => v !== undefined))
          if (Object.keys(patch).length) ok(await supabase.from('leads').update(patch).eq('id', id))

          if (name !== undefined || phone !== undefined || email !== undefined) {
            const cp: Record<string, unknown> = {}
            if (name) cp.name = name
            if (phone) cp.phone = phone // normalize_contact_phone_trg canonicalises this server side
            if (email !== undefined) cp.email = email
            if (Object.keys(cp).length) ok(await supabase.from('contacts').update(cp).eq('id', l.contact_id))
          }
          await logRemote(id, 'note', 'Lead requirement details updated', user.id)
          await touch()
        }),
    }),
    /** Link or unlink the properties this buyer is being shown. */
    setProperties: useMutation({
      mutationFn: (property_ids: string[]) =>
        write(async () => {
          const l = ownLead(user, id)
          const before = new Set(l.property_ids)
          const next = [...new Set(property_ids)].filter(pid => db.properties.some(p => p.id === pid))
          ok(await supabase.from('leads').update({ property_ids: next }).eq('id', id))
          const added = next.filter(pid => !before.has(pid))
          const removed = [...before].filter(pid => !next.includes(pid))
          const title = (pid: string) => db.properties.find(p => p.id === pid)?.title ?? pid
          if (added.length) await logRemote(id, 'note', `Property added: ${added.map(title).join(', ')}`, user.id)
          if (removed.length) await logRemote(id, 'note', `Property removed: ${removed.map(title).join(', ')}`, user.id)
        }),
    }),
    /**
     * Book the next action. A timed kind (meeting, site visit) takes a slot, so it is
     * refused when it overlaps something already booked — same guard the calendar uses.
     */
    followUp: useMutation({
      mutationFn: ({ title, kind, due_at, ends_at }: { title: string; kind: TaskKind; due_at: string; ends_at?: string | null }) =>
        write(async () => {
          const l = ownLead(user, id)
          const task = {
            id: uid(), title, kind, lead_id: id, property_id: l.property_ids[0] ?? null, assigned_to: l.assigned_to ?? user.id,
            due_at, ends_at: ends_at ?? null, status: 'pending' as const, created_by: user.id,
          }
          const clash = findClash(db, { ...task, id: task.id })
          if (clash) throw new Error(`That slot is already taken by "${clash.title}" at ${dateTime(clash.due_at)}. Pick another time.`)
          ok(await supabase.from('tasks').insert(task))
          await logRemote(id, 'follow_up', `${TASK_KIND_LABEL[kind]} scheduled: ${title} — ${dateTime(due_at)}`, user.id)
        }),
    }),
    completeTask: useMutation({
      mutationFn: (taskId: string) =>
        write(async () => {
          ownLead(user, id)
          const t = db.tasks.find(t => t.id === taskId && t.lead_id === id)
          if (!t) throw new Error('Task not found')
          ok(await supabase.from('tasks').update({ status: 'done' }).eq('id', taskId))
          await logRemote(id, 'follow_up', `Completed: ${t.title}`, user.id)
        }),
    }),
  }
}
