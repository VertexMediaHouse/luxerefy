import { useMutation, useQuery } from '@tanstack/react-query'
import { db, respond, write } from '../../lib/mock/db'
import { canSeeLead, canSeeTask, findClash, isManager, logActivity, uid } from '../../lib/rules'
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

export function useSaveTask() {
  const user = useUser()
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: TaskInput }) =>
      write(() => {
        if (!input.title.trim()) throw new Error('Give the task a title')
        if (input.ends_at && input.ends_at <= input.due_at) throw new Error('End time must be after the start')
        const lead = input.lead_id ? db.leads.find(l => l.id === input.lead_id) : null
        if (input.lead_id && (!lead || !canSeeLead(user, lead))) throw new Error('Lead not found')
        const existing = db.tasks.find(t => t.id === id)
        if (id && (!existing || !canSeeTask(user, existing))) throw new Error('Task not found')
        const now = new Date().toISOString()
        const was = existing && { due_at: existing.due_at, ends_at: existing.ends_at }
        const task: Task = {
          ...(existing ?? { id: uid(), status: 'pending', created_by: user.id, created_at: now }),
          ...input,
          assigned_to: isManager(user) ? input.assigned_to : user.id, // RLS with-check: agents only schedule themselves
        }
        const clash = findClash(db, task)
        if (clash) throw new Error(`That slot is already booked — "${clash.title}" at ${dateTime(clash.due_at)}. Pick another time.`)
        if (existing) {
          Object.assign(existing, task)
          // A move is worth recording on the lead, so the timeline explains the new date.
          if (was && (was.due_at !== task.due_at || was.ends_at !== task.ends_at) && task.lead_id)
            logActivity(db, task.lead_id, 'follow_up', `Rescheduled: ${task.title} — ${dateTime(was.due_at)} → ${dateTime(task.due_at)}`, user.id, now)
        } else {
          db.tasks.push(task)
          if (task.lead_id) logActivity(db, task.lead_id, 'follow_up', `Scheduled: ${task.title} — ${dateTime(task.due_at)}`, user.id, now)
        }
        return task
      }),
  })
}

export function useSetTaskStatus() {
  const user = useUser()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Task['status'] }) =>
      write(() => {
        const t = db.tasks.find(t => t.id === id)
        if (!t || !canSeeTask(user, t)) throw new Error('Task not found')
        // Reopening a slot re-checks the exclusion constraint.
        const clash = status !== 'cancelled' && findClash(db, { ...t, status })
        if (clash) throw new Error(`Reopening this clashes with "${clash.title}". Move one of them first.`)
        t.status = status
        if (t.lead_id && status === 'done') logActivity(db, t.lead_id, 'follow_up', `Completed: ${t.title}`, user.id, new Date().toISOString())
      }),
  })
}
