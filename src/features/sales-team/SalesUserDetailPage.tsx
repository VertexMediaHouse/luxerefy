import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  CalendarDays,
  Clock,
  Eye,
  Mail,
  Phone,
  Users,
} from 'lucide-react'
import {
  Avatar,
  Badge,
  Button,
  Card,
  Empty,
  Loading,
  PageHeader,
  StageChip,
  T,
  Tabs,
} from '../../components/ui'
import { useSession } from '../../lib/session'
import { relative, dateTime } from '../../lib/format'
import { stagesOf } from '../../lib/stages'
import { db } from '../../lib/db'
import { ActivityTimeline } from '../leads/ActivityTimeline'
import { useSalesUserDetail } from './api'
import { SalesUserModal } from './SalesUserModal'

export function SalesUserDetailPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { startImpersonating } = useSession()
  const { data, isLoading } = useSalesUserDetail(id)

  const [tab, setTab] = useState<'leads' | 'tasks' | 'timeline'>('leads')
  const [editModalOpen, setEditModalOpen] = useState(false)

  if (isLoading || !data) return <Loading />
  const { user, leads, tasks, activities } = data

  if (!user) {
    return (
      <Card>
        <Empty icon={Users}>
          Sales user not found.{' '}
          <Link to="/sales-team" className="font-semibold text-slate-900 underline">
            Back to Sales Team
          </Link>
        </Empty>
      </Card>
    )
  }

  const wonLeads = leads.filter(l => l.status.endsWith('-won'))
  const lostLeads = leads.filter(l => l.status.endsWith('-lost'))
  const openLeads = leads.filter(l => !l.status.endsWith('-won') && !l.status.endsWith('-lost'))
  const pendingTasks = tasks.filter(t => t.status === 'pending')
  const completedTasks = tasks.filter(t => t.status === 'done')

  // Stages breakdown for the first pipeline
  const stages = stagesOf('pl-1')
  const stageCounts = Object.fromEntries(stages.map(s => [s.id, leads.filter(l => l.status === s.id).length]))

  const handleViewAs = () => {
    startImpersonating({
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      role: 'sales',
      active: user.active,
    })
    nav('/sales')
  }

  return (
    <>
      <PageHeader
        back={{ to: '/sales-team', label: 'Sales Team' }}
        title={user.full_name}
        subtitle={`${user.email} • Sales Representative`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={handleViewAs}>
              <Eye className="size-4 text-blue-600" /> View as this user
            </Button>
            <Button variant="secondary" onClick={() => setEditModalOpen(true)}>
              Edit user
            </Button>
          </div>
        }
      />

      {/* Profile summary banner */}
      <Card className="mb-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar name={user.full_name} size="lg" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">{user.full_name}</h2>
                <Badge tone={user.active ? 'green' : 'slate'}>{user.active ? 'Active' : 'Inactive'}</Badge>
                {user.force_password_change && (
                  <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                    Password Reset Required
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Mail className="size-3.5 text-slate-400" /> {user.email}
                </span>
                {user.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="size-3.5 text-slate-400" /> {user.phone}
                  </span>
                )}
                <span>Last login: {user.last_login ? relative(user.last_login) : 'Never'}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* KPI Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-400">Total Assigned Leads</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{leads.length}</div>
          <div className="mt-1 text-xs text-slate-500">{openLeads.length} active in pipeline</div>
        </Card>

        <Card className="p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-400">Won Deals</div>
          <div className="mt-2 text-2xl font-bold text-emerald-600">{wonLeads.length}</div>
          <div className="mt-1 text-xs text-slate-500">{lostLeads.length} marked as lost</div>
        </Card>

        <Card className="p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-400">Conversion Rate</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{user.conversion_rate}%</div>
          <div className="mt-1 text-xs text-emerald-600 font-medium">Won deals / total assigned</div>
        </Card>

        <Card className="p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-400">Pending Tasks</div>
          <div className="mt-2 text-2xl font-bold text-amber-600">{pendingTasks.length}</div>
          <div className="mt-1 text-xs text-slate-500">{completedTasks.length} completed tasks</div>
        </Card>
      </div>

      {/* Pipeline Stage Breakdown */}
      <Card className="mb-6 p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Lead Pipeline Distribution</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {stages.map(s => {
            const count = stageCounts[s.id] || 0
            return (
              <div key={s.id} className="rounded-lg bg-slate-50 border border-slate-100 p-2.5 text-center">
                <div className="text-xs font-medium text-slate-500 truncate" title={s.label}>
                  {s.label}
                </div>
                <div className="mt-1 text-lg font-bold text-slate-800">{count}</div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Tabs Section */}
      <Card>
        <div className="border-b border-slate-100 px-4 pt-2">
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { value: 'leads', label: 'Assigned Leads', count: leads.length, icon: Users },
              { value: 'tasks', label: 'Tasks', count: tasks.length, icon: Clock },
              { value: 'timeline', label: 'Activity Timeline', count: activities.length, icon: CalendarDays },
            ]}
          />
        </div>

        <div className="p-4">
          {tab === 'leads' && (
            <div>
              {leads.length === 0 ? (
                <Empty icon={Users}>No leads currently assigned to this representative.</Empty>
              ) : (
                <table className={T.table}>
                  <thead className={T.head}>
                    <tr>
                      <th className={T.th}>Lead / Contact</th>
                      <th className={T.th}>Stage</th>
                      <th className={T.th}>Source</th>
                      <th className={T.th}>City</th>
                      <th className={T.th}>Created</th>
                      <th className={`${T.th} text-right`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className={T.body}>
                    {leads.map(l => {
                      const c = db.contacts.find(con => con.id === l.contact_id)
                      return (
                        <tr key={l.id} className={T.row} onClick={() => nav(`/leads/${l.id}`)}>
                          <td className={T.td}>
                            <div className="font-semibold text-slate-900">{c?.name || 'Unknown'}</div>
                            <div className="text-xs text-slate-400">{c?.phone}</div>
                          </td>
                          <td className={T.td}>
                            <StageChip status={l.status} />
                          </td>
                          <td className={T.td}>
                            <span className="text-xs text-slate-600 capitalize">{l.source}</span>
                          </td>
                          <td className={T.td}>
                            <span className="text-xs text-slate-600">{l.city || '—'}</span>
                          </td>
                          <td className={T.td}>
                            <span className="text-xs text-slate-400">{relative(l.created_at)}</span>
                          </td>
                          <td className={`${T.td} text-right`}>
                            <Link
                              to={`/leads/${l.id}`}
                              className="text-xs font-medium text-blue-600 hover:underline"
                              onClick={e => e.stopPropagation()}
                            >
                              View details
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'tasks' && (
            <div>
              {tasks.length === 0 ? (
                <Empty icon={Clock}>No tasks found for this sales representative.</Empty>
              ) : (
                <div className="divide-y divide-slate-100">
                  {tasks.map(t => (
                    <div key={t.id} className="flex items-center justify-between py-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`size-2 rounded-full ${
                              t.status === 'done'
                                ? 'bg-emerald-500'
                                : Date.parse(t.due_at) < Date.now()
                                  ? 'bg-red-500'
                                  : 'bg-blue-500'
                            }`}
                          />
                          <span className={`text-sm font-medium ${t.status === 'done' ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                            {t.title}
                          </span>
                          <span className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 uppercase font-mono text-[10px]">
                            {t.kind}
                          </span>
                          {t.created_by && t.created_by !== user.id && (
                            <span className="text-[10px] bg-blue-50 text-blue-700 font-medium px-1.5 py-0.5 rounded">
                              Assigned by admin
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">Due: {dateTime(t.due_at)}</div>
                      </div>
                      <Badge tone={t.status === 'done' ? 'green' : 'amber'}>
                        {t.status === 'done' ? 'Completed' : 'Pending'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'timeline' && (
            <div className="py-2">
              {activities.length === 0 ? (
                <Empty icon={CalendarDays}>No recorded activity for this sales representative yet.</Empty>
              ) : (
                <ActivityTimeline
                  showLead
                  items={activities.map(a => {
                    const l = db.leads.find(lead => lead.id === a.lead_id)
                    const c = l ? db.contacts.find(con => con.id === l.contact_id) : null
                    return {
                      ...a,
                      actor: a.actor_id === user.id ? user.full_name : 'Admin',
                      lead: { id: a.lead_id, name: c?.name || 'Lead' },
                    }
                  })}
                />
              )}
            </div>
          )}
        </div>
      </Card>

      {editModalOpen && (
        <SalesUserModal
          open={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          initialData={user}
        />
      )}
    </>
  )
}
