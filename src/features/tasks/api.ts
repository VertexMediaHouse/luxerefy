import { useMutation, useQuery } from '@tanstack/react-query'
import { db, respond, write } from '../../lib/mock/db'
import { supabase } from '../../lib/supabase'
import { canSeeLead, canSeeTask, findClash, isManager } from '../../lib/rules'
import { useUser } from '../../lib/session'
import { dateTime } from '../../lib/format'
import type { Task } from '../../lib/types'

export type TaskInput = Pick<Task, 'title' | 'kind' | 'lead_id' | 'property_id' | 'assigned_to' | 'due_at' | 'ends_at'>

const join = (t: Task) => {
  const lead = db.leads.find(l => l.id === t.lead_id)
  return {
    ...t,
    lead_name: db.contacts.find(c => c.id === lead?.contact_id)?.name ?? null,
    property_title: db.properties.find(p => p.id === t.property_id)?.title ?? null,
    assignee_name: db.profiles.find(p => p.id === t.assigned_to)?.full_name ?? '—',
  }
}
export type TaskRow = ReturnType<typeof join>

export const isOverdue = (t: Pick<Task, 'status' | 'due_at'>) => t.status === 'pending' && Date.parse(t.due_at) < Date.now()

export function useTasks() {
  const user = useUser()
  return useQuery({
    queryKey: ['tasks', user.id],
    queryFn: () => respond(db.tasks.filter(t => canSeeTask(user, t)).sort((a, b) => a.due_at.localeCompare(b.due_at)).map(join)),
  })
}

/** In-app reminders: my pending tasks that are overdue or due before midnight. */
export function useReminders() {
  const user = useUser()
  return useQuery({
    queryKey: ['reminders', user.id],
    queryFn: () => {
      const end = new Date()
      end.setHours(23, 59, 59, 999)
      return respond(db.tasks.filter(t => t.assigned_to === user.id && t.status === 'pending' && Date.parse(t.due_at) <= end.getTime()).sort((a, b) => a.due_at.localeCompare(b.due_at)).map(join))
    },
    refetchInterval: 60_000,
  })
}

async function logActivity(lead_id: string, type: string, body: string, actor_id: string | null) {
  const { error } = await supabase.from('lead_activities').insert({ lead_id, type, body, actor_id, meta: {} })
  if (error) throw new Error(error.message)
}

export function useSaveTask() {
  const user = useUser()
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: TaskInput }) =>
      write(async () => {
        if (!input.title.trim()) throw new Error('Give the task a title')
        if (input.ends_at && input.ends_at <= input.due_at) throw new Error('End time must be after the start')
        const lead = input.lead_id ? db.leads.find(l => l.id === input.lead_id) : null
        if (input.lead_id && (!lead || !canSeeLead(user, lead))) throw new Error('Lead not found')
        const existing = db.tasks.find(t => t.id === id)
        if (id && (!existing || !canSeeTask(user, existing))) throw new Error('Task not found')
        const assigned_to = isManager(user) ? input.assigned_to : user.id // RLS with-check: agents only schedule themselves
        const patch = { ...input, assigned_to }
        const candidate = { id: id ?? crypto.randomUUID(), assigned_to, due_at: patch.due_at, ends_at: patch.ends_at, status: 'pending' as const }
        const clash = findClash(db, candidate)
        if (clash) throw new Error(`That slot is already booked — "${clash.title}" at ${dateTime(clash.due_at)}. Pick another time.`)

        if (existing) {
          const { data, error } = await supabase.from('tasks').update(patch).eq('id', id).select().single()
          if (error) throw new Error(error.message)
          // A move is worth recording on the lead, so the timeline explains the new date.
          if ((existing.due_at !== patch.due_at || existing.ends_at !== patch.ends_at) && patch.lead_id)
            await logActivity(patch.lead_id, 'follow_up', `Rescheduled: ${patch.title} — ${dateTime(existing.due_at)} → ${dateTime(patch.due_at)}`, user.id)
          return data
        }
        const { data, error } = await supabase.from('tasks').insert({ ...patch, status: 'pending', created_by: user.id }).select().single()
        if (error) throw new Error(error.message)
        if (patch.lead_id) await logActivity(patch.lead_id, 'follow_up', `Scheduled: ${patch.title} — ${dateTime(patch.due_at)}`, user.id)
        return data
      }),
  })
}

export function useSetTaskStatus() {
  const user = useUser()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Task['status'] }) =>
      write(async () => {
        const t = db.tasks.find(t => t.id === id)
        if (!t || !canSeeTask(user, t)) throw new Error('Task not found')
        // Reopening a slot re-checks the exclusion constraint.
        const clash = status !== 'cancelled' && findClash(db, { ...t, status })
        if (clash) throw new Error(`Reopening this clashes with "${clash.title}". Move one of them first.`)
        const { error } = await supabase.from('tasks').update({ status }).eq('id', id)
        if (error) throw new Error(error.message)
        if (t.lead_id && status === 'done') await logActivity(t.lead_id, 'follow_up', `Completed: ${t.title}`, user.id)
      }),
  })
}
