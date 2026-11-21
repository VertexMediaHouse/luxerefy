import { useMutation, useQuery } from '@tanstack/react-query'
import { captureRemote, db, ok, respond, write, writeHooks } from '../../lib/db'
import { supabase } from '../../lib/supabase'
import { canSeeLead, findClash, isLost, isOpen, isWon, uid, type CaptureInput } from '../../lib/rules'
import { useUser } from '../../lib/session'
import { stage, stageLabel } from '../../lib/stages'
import { dateTime } from '../../lib/format'
import { TASK_KIND_LABEL } from '../../lib/labels'
import type { ActivityType, Lead, LeadStatus, LeadType, Profile, Property, Task, TaskKind } from '../../lib/types'

const byNewest = (a: { created_at: string }, b: { created_at: string }) => b.created_at.localeCompare(a.created_at)

/**
 * Lookups for join(), built in one pass per table. Scanning every activity and task per lead was
 * O(leads x rows) and froze the board for over a second. Rebuilt only when refresh() swaps a table.
 */
let idx: ReturnType<typeof buildIndex> | null = null
function buildIndex() {
  const src = [db.contacts, db.properties, db.lead_activities, db.documents, db.tasks] as const
  const count = (rows: { lead_id: string | null }[]) => {
    const m = new Map<string, number>()
    for (const r of rows) if (r.lead_id) m.set(r.lead_id, (m.get(r.lead_id) ?? 0) + 1)
    return m
  }
  const nextTask = new Map<string, Task>()
  for (const t of db.tasks) {
    if (!t.lead_id || t.status !== 'pending') continue
    const cur = nextTask.get(t.lead_id)
    if (!cur || t.due_at < cur.due_at) nextTask.set(t.lead_id, t)
  }
  return {
    src,
    contacts: new Map(db.contacts.map(c => [c.id, c])),
    properties: new Map(db.properties.map(p => [p.id, p])),
    activities: count(db.lead_activities),
    docs: count(db.documents),
    nextTask,
  }
}
function index() {
  const src = [db.contacts, db.properties, db.lead_activities, db.documents, db.tasks]
  if (!idx || idx.src.some((a, i) => a !== src[i])) idx = buildIndex()
  return idx
}

function join(l: Lead) {
  const i = index()
  return {
    ...l,
    contact: i.contacts.get(l.contact_id)!,
    // A buyer is usually shown several places, so every linked property travels with the lead.
    properties: l.property_ids.map(id => i.properties.get(id)).filter((p): p is Property => !!p),
    activity_count: i.activities.get(l.id) ?? 0,
    doc_count: i.docs.get(l.id) ?? 0,
    // The board card shows the next commitment, which is the thing you actually act on.
    next_task: i.nextTask.get(l.id) ?? null,
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

  const now = new Date().toISOString()
  const contact = db.contacts.find(c => c.id === l.contact_id)

  const ops: PromiseLike<unknown>[] = [
    logRemote(id, 'status_change', `Stage changed from ${stageLabel(l.status)} to ${stageLabel(status)}${reason ? ` — ${reason}` : ''}`, user.id),
    supabase.from('leads').update({
      status, pipeline_id: stage(status)?.pipeline_id ?? l.pipeline_id,
      lost_reason: isLost({ status }) ? reason ?? null : null,
      updated_at: now,
    }).eq('id', id).then(ok),
  ]

  if (isWon({ status }) && contact?.kind === 'lead') {
    ops.push(supabase.from('contacts').update({ kind: 'client' }).eq('id', contact.id).then(ok))
  }

  await Promise.all(ops)
}

/**
 * Stage change, optimistic: the mirror moves the lead at once, the save runs behind it, and a
 * failed save puts the lead back. Waiting for the round trip made the board feel stuck.
 */
let movesInFlight = 0
async function moveLead(user: Profile, id: string, status: LeadStatus, reason?: string) {
  const l = ownLead(user, id)
  movesInFlight++
  const before = { status: l.status, pipeline_id: l.pipeline_id, lost_reason: l.lost_reason, updated_at: l.updated_at }
  const save = applyStatus(user, id, status, reason)
  save.catch(() => {}) // handled below; stops an unhandled-rejection warning before the await
  Object.assign(l, {
    status, pipeline_id: stage(status)?.pipeline_id ?? l.pipeline_id,
    lost_reason: isLost({ status }) ? reason ?? null : null, updated_at: new Date().toISOString(),
  })
  if (isWon({ status })) {
    const contact = db.contacts.find(c => c.id === l.contact_id)
    if (contact && contact.kind === 'lead') contact.kind = 'client'
  }
  writeHooks.after()
  try {
    await save
  } catch (e) {
    Object.assign(l, before)
    writeHooks.after()
    throw e
  } finally {
    movesInFlight--
  }
}

/** Board drag-and-drop. Separate from useLeadActions because the card is not the open lead. */
export function useMoveLead() {
  const user = useUser()
  return useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: LeadStatus; reason?: string }) => moveLead(user, id, status, reason),
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

export function useDeleteLeads() {
  const user = useUser()
  return useMutation({
    mutationFn: (ids: string[]) =>
      write(async () => {
        ids.forEach(id => ownLead(user, id)) // permission check every lead before deleting any
        ok(await supabase.from('leads').delete().in('id', ids))
      }),
  })
}

export function useLeadActions(id: string) {
  const user = useUser()
  /** Bump the lead so "last activity" sorting stays honest. The set_leads_updated_at trigger supplies now(). */
  const touch = async () => ok(await supabase.from('leads').update({ updated_at: new Date().toISOString() }).eq('id', id))
  return {
    setStatus: useMutation({
      mutationFn: ({ status, reason }: { status: LeadStatus; reason?: string }) => moveLead(user, id, status, reason),
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
