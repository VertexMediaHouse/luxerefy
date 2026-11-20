import { Link, useNavigate } from 'react-router'
import {
  AlertCircle,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Flame,
  Phone,
  Sparkles,
  Target,
  TrendingUp,
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
import { isOverdue, useSetTaskStatus } from '../tasks/api'

export function SalesDashboardPage() {
  const user = useUser()
  const nav = useNavigate()
  const setTaskStatus = useSetTaskStatus()
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()

  // Strict scoping: only own data
  const myLeads = db.leads.filter(l => l.assigned_to === user.id)
  const myTasks = db.tasks.filter(t => t.assigned_to === user.id && t.status !== 'cancelled')

  // KPI Calculations
  const assignedLeadsCount = myLeads.length
  const newLeadsToday = myLeads.filter(l => l.created_at.slice(0, 10) === todayStr).length
  const followUpsDueToday = myTasks.filter(
    t => t.status === 'pending' && t.due_at.slice(0, 10) === todayStr,
  ).length
  const overdueTasks = myTasks.filter(t => t.status === 'pending' && Date.parse(t.due_at) < Date.now())
  const tasksCompletedThisWeek = myTasks.filter(
    t => t.status === 'done' && t.due_at >= oneWeekAgo,
  ).length
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

      {/* 7 KPI Cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <Card className="p-3.5">
          <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
            <Users className="size-3.5 text-blue-600" /> Assigned Leads
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{assignedLeadsCount}</div>
          <p className="mt-1 text-[11px] text-slate-400">Total in your queue</p>
        </Card>

        <Card className="p-3.5">
          <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
            <Sparkles className="size-3.5 text-blue-500" /> New Today
          </div>
          <div className="mt-2 text-2xl font-bold text-blue-600">{newLeadsToday}</div>
          <p className="mt-1 text-[11px] text-slate-400">Assigned today</p>
        </Card>

        <Card className="p-3.5">
          <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
            <CalendarClock className="size-3.5 text-amber-600" /> Due Today
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{followUpsDueToday}</div>
          <p className="mt-1 text-[11px] text-slate-400">Follow-ups due</p>
        </Card>

        <Card className={`p-3.5 ${overdueTasks.length > 0 ? 'border-red-200 bg-red-50/40' : ''}`}>
          <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
            <AlertCircle className={`size-3.5 ${overdueTasks.length > 0 ? 'text-red-600' : 'text-slate-400'}`} /> Overdue
          </div>
          <div className={`mt-2 text-2xl font-bold ${overdueTasks.length > 0 ? 'text-red-600' : 'text-slate-900'}`}>
            {overdueTasks.length}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Requires action</p>
        </Card>

        <Card className="p-3.5">
          <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
            <CheckCircle2 className="size-3.5 text-emerald-600" /> Done This Week
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600">{tasksCompletedThisWeek}</div>
          <p className="mt-1 text-[11px] text-slate-400">Tasks completed</p>
        </Card>

        <Card className="p-3.5">
          <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
            <Target className="size-3.5 text-emerald-600" /> Won Deals
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{wonDeals}</div>
          <p className="mt-1 text-[11px] text-slate-400">Successfully closed</p>
        </Card>

        <Card className="p-3.5 col-span-2 sm:col-span-1">
          <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
            <TrendingUp className="size-3.5 text-blue-600" /> Conversion
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{conversionRate}%</div>
          <p className="mt-1 text-[11px] text-emerald-600 font-medium">Won / Assigned</p>
        </Card>
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
              title="Upcoming This Week"
              subtitle="Scheduled visits and meetings"
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
                  <div key={t.id} className="flex items-center justify-between p-3 text-xs">
                    <div>
                      <div className="font-semibold text-slate-800">{t.title}</div>
                      <div className="text-slate-400">{dateTime(t.due_at)}</div>
                    </div>
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-600 uppercase">
                      {t.kind}
                    </span>
                  </div>
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
