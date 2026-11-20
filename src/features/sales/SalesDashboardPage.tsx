import { Link, useNavigate } from 'react-router'
import {
  AlertCircle,
  CalendarClock,
  CalendarDays,
  BellOff,
  Check,
  CheckCircle2,
  Clock,
  Flame,
  Phone,
  Target,
  Users,
} from 'lucide-react'
import {
  Badge,
  Card,
  CardHeader,
  PageHeader,
} from '../../components/ui'
import { useUser } from '../../lib/session'
import { db } from '../../lib/db'
import { dateTime, prettyPhone, relative } from '../../lib/format'
import { stagesOf } from '../../lib/stages'
import { isOpen } from '../../lib/rules'
import { TASK_KIND_LABEL } from '../../lib/labels'
import { useLeads } from '../leads/api'
import { isOverdue, useSetTaskStatus, useTasks } from '../tasks/api'

export function SalesDashboardPage() {
  const user = useUser()
  const nav = useNavigate()
  const setTaskStatus = useSetTaskStatus()
  useLeads()
  useTasks()
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)

  // Strict scoping: only own data
  const myLeads = db.leads.filter(l => l.assigned_to === user.id)
  const myTasks = db.tasks.filter(t => t.assigned_to === user.id && t.status !== 'cancelled')

  // KPI Calculations
  const assignedLeadsCount = myLeads.length
  const openLeads = myLeads.filter(isOpen).length
  const newLeadsToday = myLeads.filter(l => l.created_at.slice(0, 10) === todayStr).length
  const followUpsDueToday = myTasks.filter(
    t => t.status === 'pending' && t.due_at.slice(0, 10) === todayStr,
  ).length
  const overdueTasks = myTasks.filter(isOverdue)
  const pendingLeadIds = new Set(myTasks.filter(t => t.status === 'pending').map(t => t.lead_id))
  const noFollowUp = myLeads.filter(l => isOpen(l) && !pendingLeadIds.has(l.id)).length
  const wonDeals = myLeads.filter(l => l.status.endsWith('-won')).length
  const conversionRate = assignedLeadsCount
    ? Math.round((wonDeals / assignedLeadsCount) * 100)
    : 0

  // Pipeline breakdown
  const stages = stagesOf('pl-1')
  const stageCounts = Object.fromEntries(
    stages.map(s => [s.id, myLeads.filter(l => l.status === s.id).length]),
  )

  // Today's focus: overdue items first, then items due today
  const focusTasks = [
    ...overdueTasks.sort((a, b) => a.due_at.localeCompare(b.due_at)),
    ...myTasks
      .filter(t => t.status === 'pending' && t.due_at.slice(0, 10) === todayStr && !isOverdue(t))
      .sort((a, b) => a.due_at.localeCompare(b.due_at)),
  ].slice(0, 6)

  // Upcoming tasks
  const upcomingTasks = myTasks
    .filter(t => t.status === 'pending' && t.due_at.slice(0, 10) > todayStr)
    .sort((a, b) => a.due_at.localeCompare(b.due_at))
    .slice(0, 5)

  // Recent activity on own leads
  const leadIdSet = new Set(myLeads.map(l => l.id))
  const recentActivities = db.lead_activities
    .filter(a => leadIdSet.has(a.lead_id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 6)

  const greeting = () => {
    const h = today.getHours()
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  }

  const handleQuickComplete = (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setTaskStatus.mutate({ id: taskId, status: 'done' })
  }

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user.full_name.split(' ')[0]}`}
        subtitle={`Here's your sales pipeline and priorities for ${today.toLocaleDateString('en-IN', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
        })}`}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { to: '/sales/leads', icon: Users, label: 'Open leads', value: openLeads, note: newLeadsToday ? `+${newLeadsToday} new today` : `${assignedLeadsCount} assigned in total`, tone: 'text-blue-600' },
          { to: '/sales/tasks?filter=today', icon: CalendarClock, label: 'Due today', value: followUpsDueToday, note: 'Follow-ups and visits', tone: 'text-amber-600' },
          { to: '/sales/tasks?filter=overdue', icon: AlertCircle, label: 'Overdue', value: overdueTasks.length, note: overdueTasks.length ? 'Clear these first' : 'Nothing late', tone: 'text-red-600', alert: overdueTasks.length > 0 },
          { to: '/sales/leads?followup=none', icon: BellOff, label: 'No follow-up', value: noFollowUp, note: 'Open leads with no next step', tone: 'text-amber-600', warn: noFollowUp > 0 },
          { to: `/sales/leads?status=${stages.find(s => s.kind === 'won')?.id ?? ''}`, icon: Target, label: 'Won', value: wonDeals, note: `${conversionRate}% conversion`, tone: 'text-emerald-600' },
        ].map(k => (
          <Link
            key={k.label}
            to={k.to}
            className={`group rounded-xl border bg-white p-4 shadow-soft transition-colors hover:border-slate-300 ${
              k.alert ? 'border-red-200 bg-red-50/40' : k.warn ? 'border-amber-200 bg-amber-50/30' : 'border-slate-200/80'
            } ${k.label === 'Won' ? 'col-span-2 sm:col-span-1' : ''}`}
          >
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <k.icon className={`size-3.5 ${k.tone}`} /> {k.label}
            </div>
            <div className={`mt-2 text-2xl font-bold tabular-nums ${k.alert ? 'text-red-600' : 'text-slate-900'}`}>{k.value}</div>
            <p className="mt-0.5 text-xs text-slate-400 group-hover:text-slate-500">{k.note}</p>
          </Link>
        ))}
      </div>

      {/* Pipeline Stage Breakdown */}
      <Card className="mb-6 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-900">My Pipeline Overview</h2>
          <Link to="/sales/leads" className="text-xs font-semibold text-blue-600 hover:underline">
            View All Leads →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {stages.map(s => {
            const count = stageCounts[s.id] || 0
            const pct = assignedLeadsCount ? Math.round((count / assignedLeadsCount) * 100) : 0
            return (
              <Link
                key={s.id}
                to={`/sales/leads?status=${s.id}`}
                className="rounded-lg bg-slate-50 border border-slate-100 p-2.5 text-center transition-all hover:border-blue-300 hover:bg-blue-50/50"
              >
                <div className="text-[11px] font-medium text-slate-500 truncate" title={s.label}>
                  {s.label}
                </div>
                <div className="mt-1 text-lg font-bold text-slate-800">{count}</div>
                <div className="text-[10px] text-slate-400">{pct}%</div>
              </Link>
            )
          })}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Today's Focus List */}
        <Card>
          <CardHeader
            icon={Flame}
            title="Today's Focus & Overdue"
            subtitle={`${focusTasks.length} high priority actions`}
            action={
              <Link to="/sales/tasks?filter=today" className="text-xs font-semibold text-blue-600 hover:underline">
                View all
              </Link>
            }
          />
          <div className="divide-y divide-slate-100">
            {focusTasks.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-400">
                <CheckCircle2 className="size-8 mx-auto text-emerald-500 mb-2" />
                <p className="font-medium text-slate-800">You are all caught up for today!</p>
                <p className="text-xs text-slate-400 mt-1">No pending tasks or overdue follow-ups.</p>
              </div>
            ) : (
              focusTasks.map(t => {
                const lead = db.leads.find(l => l.id === t.lead_id)
                const contact = lead ? db.contacts.find(c => c.id === lead.contact_id) : null
                const overdue = isOverdue(t)
                return (
                  <div
                    key={t.id}
                    onClick={() => nav(t.lead_id ? `/sales/leads/${t.lead_id}` : '/sales/tasks')}
                    className="flex items-center justify-between p-3.5 hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={e => handleQuickComplete(t.id, e)}
                        className="size-5 rounded border border-slate-300 hover:border-emerald-500 hover:bg-emerald-50 flex items-center justify-center shrink-0 transition-colors"
                        title="Mark as done"
                      >
                        <Check className="size-3 text-transparent hover:text-emerald-600" />
                      </button>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900 truncate">{t.title}</span>
                          {overdue && <Badge tone="red">Overdue</Badge>}
                        </div>
                        {contact && (
                          <div className="mt-0.5 text-xs text-slate-500 flex items-center gap-2">
                            <span>{contact.name}</span>
                            <span>•</span>
                            <span className="text-slate-400">{prettyPhone(contact.phone)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-3" onClick={e => e.stopPropagation()}>
                      {contact && (
                        <a
                          href={`tel:${contact.phone}`}
                          className="rounded-lg p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                          title="Call immediately"
                        >
                          <Phone className="size-3.5" />
                        </a>
                      )}
                      <span className="text-xs text-slate-400 font-mono text-[11px]">
                        {new Date(t.due_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </Card>

        {/* Upcoming Tasks + Recent Activity */}
        <div className="space-y-6">
          <Card>
            <CardHeader
              icon={Clock}
              title="Coming up"
              subtitle="Your next scheduled tasks"
              action={
                <Link to="/sales/calendar" className="text-xs font-semibold text-blue-600 hover:underline">
                  Calendar →
                </Link>
              }
            />
            <div className="divide-y divide-slate-100">
              {upcomingTasks.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">No upcoming tasks scheduled.</div>
              ) : (
                upcomingTasks.map(t => (
                  <Link
                    key={t.id}
                    to={t.lead_id ? `/sales/leads/${t.lead_id}` : '/sales/tasks'}
                    className="flex items-center justify-between gap-3 px-4 py-3 text-xs hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-800">{t.title}</div>
                      <div className="text-slate-400">{dateTime(t.due_at)}</div>
                    </div>
                    <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                      {TASK_KIND_LABEL[t.kind]}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              icon={CalendarDays}
              title="Recent Lead Activity"
              subtitle="Latest touchpoints and updates"
            />
            <div className="divide-y divide-slate-100 p-2">
              {recentActivities.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">No recent activity on your leads.</div>
              ) : (
                recentActivities.map(a => {
                  const lead = db.leads.find(l => l.id === a.lead_id)
                  const contact = lead ? db.contacts.find(c => c.id === lead.contact_id) : null
                  return (
                    <div key={a.id} className="p-2 text-xs">
                      <div className="flex items-center justify-between">
                        <Link
                          to={`/sales/leads/${a.lead_id}`}
                          className="font-semibold text-slate-800 hover:text-blue-600 hover:underline"
                        >
                          {contact?.name || 'Lead'}
                        </Link>
                        <span className="text-slate-400">{relative(a.created_at)}</span>
                      </div>
                      <p className="mt-0.5 text-slate-600">{a.body}</p>
                    </div>
                  )
                })
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
