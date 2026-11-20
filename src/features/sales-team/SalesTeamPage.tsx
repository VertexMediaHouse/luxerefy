import { useState } from 'react'
import { useNavigate } from 'react-router'
import {
  Clock,
  Eye,
  Plus,
  TrendingUp,
  UserCheck,
  UserCog,
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
  SearchBox,
  T,
} from '../../components/ui'
import { useSession } from '../../lib/session'
import { relative } from '../../lib/format'
import { useSalesUsers, useUpdateSalesUser, useDeleteSalesUser, type SalesUserData } from './api'
import { SalesUserModal } from './SalesUserModal'

export function SalesTeamPage() {
  const nav = useNavigate()
  const { startImpersonating } = useSession()
  const { data: users = [], isLoading, error } = useSalesUsers()
  const updateMutation = useUpdateSalesUser()
  const deleteMutation = useDeleteSalesUser()

  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<SalesUserData | null>(null)

  if (isLoading) return <Loading />
  if (error) return <Empty icon={Users}>Could not load the sales team: {error.message}</Empty>

  const salesUsers = users.filter(u => u.is_sales)
  const filtered = salesUsers.filter(u =>
    search
      ? u.full_name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        u.phone.includes(search)
      : true,
  )

  const activeCount = salesUsers.filter(u => u.active).length
  const totalLeads = salesUsers.reduce((sum, u) => sum + u.assigned_leads_count, 0)
  const totalOpenTasks = salesUsers.reduce((sum, u) => sum + u.open_tasks_count, 0)
  const avgConversion = salesUsers.length
    ? Math.round(salesUsers.reduce((sum, u) => sum + u.conversion_rate, 0) / salesUsers.length)
    : 0

  const handleToggleActive = async (u: SalesUserData) => {
    if (confirm(`Are you sure you want to ${u.active ? 'deactivate' : 'activate'} ${u.full_name}?`)) {
      await updateMutation.mutateAsync({ id: u.id, active: !u.active })
    }
  }

  const handleDelete = async (u: SalesUserData) => {
    if (
      confirm(
        `Are you sure you want to delete ${u.full_name}? This will deactivate their account and keep historical assignment records.`,
      )
    ) {
      await deleteMutation.mutateAsync(u.id)
    }
  }

  const handleViewAs = (u: SalesUserData) => {
    startImpersonating({
      id: u.id,
      full_name: u.full_name,
      email: u.email,
      phone: u.phone,
      role: 'sales',
      active: u.active,
    })
    nav('/sales')
  }

  return (
    <>
      <PageHeader
        icon={UserCog}
        title="Sales Team Management"
        subtitle="Manage sales representatives, view conversion performance, and assign lead quotas"
        actions={
          <Button
            onClick={() => {
              setEditingUser(null)
              setModalOpen(true)
            }}
          >
            <Plus className="size-4" /> Add Sales User
          </Button>
        }
      />

      {/* KPI Overview Tiles */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium uppercase tracking-wider">
            <Users className="size-4 text-blue-600" /> Total Reps
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900">{salesUsers.length}</span>
            <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
              {activeCount} Active
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {salesUsers.length - activeCount} inactive / deactivated
          </p>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium uppercase tracking-wider">
            <UserCheck className="size-4 text-blue-600" /> Assigned Leads
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900">{totalLeads}</span>
            <span className="text-xs text-slate-400">across team</span>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Avg {salesUsers.length ? (totalLeads / salesUsers.length).toFixed(1) : 0} leads / rep
          </p>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium uppercase tracking-wider">
            <Clock className="size-4 text-amber-600" /> Open Tasks
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900">{totalOpenTasks}</span>
            <span className="text-xs text-amber-600 font-medium">Pending action</span>
          </div>
          <p className="mt-2 text-xs text-slate-400">Follow-ups, calls & visits</p>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium uppercase tracking-wider">
            <TrendingUp className="size-4 text-emerald-600" /> Avg Conversion
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900">{avgConversion}%</span>
            <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded-full">
              Won / Assigned
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-400">Team conversion efficiency</p>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search by name, email, phone…"
            label="Search sales team"
            className="w-full sm:w-72"
          />
          <div className="text-xs text-slate-500">
            Showing {filtered.length} of {salesUsers.length} sales members
          </div>
        </div>

        {filtered.length === 0 ? (
          <Empty icon={Users}>
            {search ? 'No sales users match your search.' : 'No sales users created yet.'}
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className={T.table}>
              <thead className={T.head}>
                <tr>
                  <th className={T.th}>Sales Rep</th>
                  <th className={T.th}>Status</th>
                  <th className={T.th}>Assigned Leads</th>
                  <th className={T.th}>Open Tasks</th>
                  <th className={T.th}>Won Deals</th>
                  <th className={T.th}>Conversion</th>
                  <th className={T.th}>Last Login</th>
                  <th className={`${T.th} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody className={T.body}>
                {filtered.map(u => (
                  <tr
                    key={u.id}
                    className={T.row}
                    onClick={() => nav(`/sales-team/${u.id}`)}
                  >
                    <td className={T.td}>
                      <div className="flex items-center gap-3">
                        <Avatar name={u.full_name} size="md" />
                        <div>
                          <span className="font-semibold text-slate-900 block hover:underline">
                            {u.full_name}
                          </span>
                          <span className="text-xs text-slate-400 block">{u.email}</span>
                          {u.phone && <span className="text-[11px] text-slate-400 block">{u.phone}</span>}
                        </div>
                      </div>
                    </td>

                    <td className={T.td}>
                      <Badge tone={u.active ? 'green' : 'slate'}>
                        {u.active ? 'Active' : 'Inactive'}
                      </Badge>
                      {u.force_password_change && (
                        <span className="ml-1 text-[10px] bg-amber-50 text-amber-700 px-1 py-0.5 rounded font-medium">
                          Pass reset
                        </span>
                      )}
                    </td>

                    <td className={T.td}>
                      <span className="font-medium text-slate-800">{u.assigned_leads_count}</span>
                    </td>

                    <td className={T.td}>
                      <span className={`font-medium ${u.open_tasks_count > 0 ? 'text-amber-600' : 'text-slate-500'}`}>
                        {u.open_tasks_count}
                      </span>
                    </td>

                    <td className={T.td}>
                      <span className="font-medium text-emerald-600">{u.won_deals}</span>
                    </td>

                    <td className={T.td}>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">{u.conversion_rate}%</span>
                        <div className="w-12 h-1.5 rounded-full bg-slate-100 overflow-hidden hidden sm:block">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${Math.min(100, u.conversion_rate)}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    <td className={T.td}>
                      <span className="text-xs text-slate-500">
                        {u.last_login ? relative(u.last_login) : 'Never'}
                      </span>
                    </td>

                    <td className={`${T.td} text-right`} onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleViewAs(u)}
                          title="View as this user (read-only preview)"
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
                        >
                          <Eye className="size-3.5" /> View As
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setEditingUser(u)
                            setModalOpen(true)
                          }}
                          className="rounded-md p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                          title="Edit user"
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleActive(u)}
                          className={`rounded-md p-1.5 text-xs font-medium ${
                            u.active ? 'text-slate-400 hover:text-amber-600' : 'text-emerald-600 hover:underline'
                          }`}
                          title={u.active ? 'Deactivate' : 'Reactivate'}
                        >
                          {u.active ? 'Deactivate' : 'Activate'}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(u)}
                          className="rounded-md p-1.5 text-slate-300 hover:text-red-600"
                          title="Delete (soft delete)"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modalOpen && (
        <SalesUserModal
          open={modalOpen}
          onClose={() => {
            setModalOpen(false)
            setEditingUser(null)
          }}
          initialData={editingUser}
        />
      )}
    </>
  )
}
