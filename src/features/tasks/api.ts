import { useMutation, useQuery } from '@tanstack/react-query'
import { db, ok, respond, write } from '../../lib/db'
import { supabase } from '../../lib/supabase'
import { canSeeLead, canSeeTask, findClash, isManager, uid } from '../../lib/rules'
import { useUser } from '../../lib/session'
import { dateTime } from '../../lib/format'
import type { Task } from '../../lib/types'

export type TaskInput = Pick<Task, 'title' | 'kind' | 'lead_id' | 'property_id' | 'assigned_to' | 'due_at' | 'ends_at'> &
  Partial<Pick<Task, 'description' | 'priority' | 'status'>>

const join = (t: Task) => {
  const lead = db.leads.find(l => l.id === t.lead_id)
  return {
    ...t,
    lead_name: db.contacts.find(c => c.id === lead?.contact_id)?.name ?? null,
    property_title: db.properties.find(p => p.id === t.property_id)?.title ?? null,
    assignee_name: db.profiles.find(p => p.id === t.assigned_to)?.full_name ?? 'â€”',
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

/** In-app reminders: my pending tasks that are overdue or due before midnight. Email copies come from the reminders cron function. */
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

/** The timeline insert, server side. */
const logRemote = (lead_id: string, body: string, actor_id: string) =>
  supabase.from('lead_activities').insert({ lead_id, type: 'follow_up', body, meta: {}, actor_id }).then(ok)

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
        const was = existing && { due_at: existing.due_at, ends_at: existing.ends_at }
        const task: Task = {
          ...(existing ?? { id: uid(), status: 'pending', created_by: user.id, created_at: new Date().toISOString() }),
          ...input,
          assigned_to: isManager(user) ? input.assigned_to : user.id, // RLS with-check: agents only schedule themselves
        }
        const clash = findClash(db, task)
        if (clash) throw new Error(`That slot is already booked â€” "${clash.title}" at ${dateTime(clash.due_at)}. Pick another time.`)
        if (existing) {
          const { id: _id, created_at, created_by, ...patch } = task
          ok(await supabase.from('tasks').update(patch).eq('id', task.id))
          // A move is worth recording on the lead, so the timeline explains the new date.
          if (was && (was.due_at !== task.due_at || was.ends_at !== task.ends_at) && task.lead_id)
            await logRemote(task.lead_id, `Rescheduled: ${task.title} â€” ${dateTime(was.due_at)} â†’ ${dateTime(task.due_at)}`, user.id)
        } else {
          ok(await supabase.from('tasks').insert(task))
          if (task.lead_id) await logRemote(task.lead_id, `Scheduled: ${task.title} â€” ${dateTime(task.due_at)}`, user.id)
        }
        return task
      }),
  })
}

export function useDeleteTask() {
  const user = useUser()
  return useMutation({
    mutationFn: (id: string) =>
      write(async () => {
        const t = db.tasks.find(t => t.id === id)
        if (!t || !canSeeTask(user, t)) throw new Error('Task not found')
        // RLS denial deletes 0 rows without an error, so check what came back.
        if (!ok(await supabase.from('tasks').delete().eq('id', id).select('id'))?.length)
          throw new Error('You do not have permission to delete this task')
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
        // Reopening a slot re-checks the overlap guard.
        const clash = status !== 'cancelled' && findClash(db, { ...t, status })
        if (clash) throw new Error(`Reopening this clashes with "${clash.title}". Move one of them first.`)
        ok(await supabase.from('tasks').update({ status }).eq('id', id))
        if (t.lead_id && status === 'done') await logRemote(t.lead_id, `Completed: ${t.title}`, user.id)
      }),
  })
}
