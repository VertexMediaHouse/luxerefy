import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router'
import {
  CalendarDays,
  CheckSquare,
  Eye,
  EyeOff,
  LayoutDashboard,
  LogOut,
  Menu,
  Users,
  X,
  Bell,
} from 'lucide-react'
import { Brand } from '../../components/Layout'
import { Avatar } from '../../components/ui'
import { useSession, useUser } from '../../lib/session'
import { toggleEyeSafe, useEyeSafe } from '../../lib/eyeSafe'
import { db } from '../../lib/db'
import { isOverdue, useTasks } from '../tasks/api'
import { useLeads } from '../leads/api'

export function SalesLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const user = useUser()
  const { signOut, isImpersonating, stopImpersonating } = useSession()
  const nav = useNavigate()
  const warm = useEyeSafe()
  // Subscribe so the sidebar counts follow every write.
  useLeads()
  useTasks()

  // Own leads & tasks count
  const myLeads = db.leads.filter(l => l.assigned_to === user.id)
  const myOpenLeads = myLeads.filter(l => !l.status.endsWith('-won') && !l.status.endsWith('-lost'))
  const myTasks = db.tasks.filter(t => t.assigned_to === user.id && t.status === 'pending')
  const myOverdueTasks = myTasks.filter(isOverdue)

  const today = new Date().toISOString().slice(0, 10)
  const unreadAssigned = myLeads.filter(l => l.created_at.slice(0, 10) === today).length

  const navItems = [
    { to: '/sales', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/sales/leads', label: 'My Leads', icon: Users, count: myOpenLeads.length },
    { to: '/sales/calendar', label: 'Calendar', icon: CalendarDays },
    {
      to: '/sales/tasks',
      label: 'Tasks',
      icon: CheckSquare,
      count: myOverdueTasks.length > 0 ? myOverdueTasks.length : myTasks.length,
      alert: myOverdueTasks.length > 0,
    },
  ]

  const handleExitImpersonation = () => {
    stopImpersonating()
    nav('/sales-team')
  }

  return (
    <div className="flex h-dvh flex-col bg-canvas">
      {/* Impersonation Banner for Admins */}
      {isImpersonating && (
        <div className="z-50 flex items-center justify-between bg-blue-600 px-4 py-2 text-xs font-medium text-white shadow-md">
          <div className="flex items-center gap-2">
            <Eye className="size-4 animate-pulse" />
            <span>
              <b>Admin Preview Mode:</b> Viewing as <b>{user.full_name}</b> ({user.email}). All modifications are scoped to this user.
            </span>
          </div>
          <button
            type="button"
            onClick={handleExitImpersonation}
            className="rounded bg-white/20 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white hover:text-blue-900 transition-colors"
          >
            Exit Preview
          </button>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Mobile Backdrop */}
        {menuOpen && (
          <div
            className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs lg:hidden"
            onClick={() => setMenuOpen(false)}
          />
        )}

        {/* Sales Navigation Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-slate-900 text-white transition-transform duration-200 lg:static lg:translate-x-0 ${
            menuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between px-5 pt-6 pb-4">
            <div className="flex items-center gap-2">
              <Brand light />
              <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-blue-300">
                SALES
              </span>
            </div>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="text-slate-400 hover:text-white lg:hidden"
            >
              <X className="size-5" />
            </button>
          </div>

          <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Sales Navigation">
            {navItems.map(item => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`
                  }
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {item.count != null && item.count > 0 && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        item.alert ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {item.count}
                    </span>
                  )}
                </NavLink>
              )
            })}
          </nav>

          {/* User profile footer */}
          <div className="border-t border-slate-800 p-4">
            <div className="flex items-center gap-3">
              <Avatar name={user.full_name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{user.full_name}</p>
                <p className="truncate text-xs text-slate-400">Sales Representative</p>
              </div>
              <button
                type="button"
                onClick={signOut}
                title="Sign out"
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Top header bar */}
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200/80 bg-white px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
                aria-label="Open sales menu"
              >
                <Menu className="size-5" />
              </button>
              <h1 className="text-sm font-semibold text-slate-800 hidden sm:block">
                Luxerefy CRM <span className="text-slate-400 font-normal">/ Sales Portal</span>
              </h1>
            </div>

            <div className="flex items-center gap-2">
              {unreadAssigned > 0 && (
                <div
                  title={`${unreadAssigned} new leads assigned today`}
                  className="flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-200"
                >
                  <Bell className="size-3.5 text-blue-600 animate-bounce" />
                  <span>{unreadAssigned} new lead{unreadAssigned === 1 ? '' : 's'}</span>
                </div>
              )}

              <button
                type="button"
                onClick={toggleEyeSafe}
                aria-pressed={warm}
                className={`rounded-lg p-1.5 transition-colors ${
                  warm ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-900'
                }`}
                title={warm ? 'Turn off eye-safety mode' : 'Turn on eye-safety mode'}
              >
                {warm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>

              <button
                type="button"
                onClick={signOut}
                className="rounded-lg p-1.5 text-slate-400 hover:text-slate-900 lg:hidden"
                title="Sign out"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          </header>

          {/* Main Outlet */}
          <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
