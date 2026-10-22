import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { Building2, CalendarDays, CheckSquare, Contact2, DatabaseBackup, Eye, EyeOff, FileText, LayoutDashboard, LifeBuoy, LogOut, Menu, Search, Settings, Target, Users, UserCog } from 'lucide-react'
import { Reminders } from '../features/tasks/Reminders'
import { useReminders } from '../features/tasks/api'
import { useLeads } from '../features/leads/api'
import { useTickets } from '../features/tickets/api'
import { useSession, useUser } from '../lib/session'
import { ROLE_LABEL } from '../lib/labels'
import { stageKind } from '../lib/stages'
import { toggleEyeSafe, useEyeSafe } from '../lib/eyeSafe'
import { weeklyBackup } from '../lib/backup'
import { Avatar } from './ui'

type Counter = 'leads' | 'tasks' | 'tickets'
type Item = { to: string; label: string; icon: typeof Users; end?: boolean; count?: Counter }
const MAIN: Item[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/leads', label: 'Leads', icon: Users, count: 'leads' },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare, count: 'tasks' },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/tickets', label: 'Tickets', icon: LifeBuoy, count: 'tickets' },
]
const GROUPS: { group: string; items: Item[] }[] = [
  { group: 'Records', items: [
    { to: '/contacts', label: 'Contacts', icon: Contact2 },
    { to: '/properties', label: 'Properties', icon: Building2 },
    { to: '/documents', label: 'Documents', icon: FileText },
  ] },
  { group: 'Admin', items: [
    { to: '/settings', label: 'Settings', icon: Settings },
    { to: '/team', label: 'Team & roles', icon: UserCog },
    { to: '/backup', label: 'Backups', icon: DatabaseBackup },
  ] },
]
const PAGE = Object.fromEntries([...MAIN, ...GROUPS.flatMap(g => g.items)].map(i => [i.to, i]))

export function Brand({ light }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`text-lg font-brand tracking-tight ${light ? 'text-white' : 'text-slate-900'}`}>Luxerefy</span>
    </div>
  )
}

export function Layout() {
  const [open, setOpen] = useState(false)
  const user = useUser()
  const { signOut } = useSession()
  const nav = useNavigate()
  const { pathname } = useLocation()
  const searchRef = useRef<HTMLInputElement>(null)
  const warm = useEyeSafe()

  const { data: leads = [] } = useLeads()
  const { data: reminders = [] } = useReminders()
  const { data: tickets = [] } = useTickets()
  const counts: Record<Counter, number> = {
    // Stages are rows, so "untouched" is the entry stage of whichever pipeline the lead is on.
    leads: leads.filter(l => stageKind(l.status) === 'entry').length,
    tasks: reminders.length,
    tickets: tickets.filter(t => t.status !== 'resolved').length,
  }

  // The browser is the only scheduler here, so the weekly snapshot is checked on load.
  useEffect(() => { void weeklyBackup() }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchRef.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const search = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const q = String(new FormData(e.currentTarget).get('q')).trim()
    nav(q ? `/leads?q=${encodeURIComponent(q)}` : '/leads')
    searchRef.current?.blur()
  }

  const section = '/' + (pathname.split('/')[1] ?? '')
  const crumb = PAGE[section] ?? PAGE['/']

  const link = ({ to, label, icon: Icon, end, count }: Item) => (
    <NavLink
      key={to}
      to={to}
      end={end}
      onClick={() => setOpen(false)}
      className={({ isActive }) => `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors ${
        isActive ? 'bg-white/[0.08] font-medium text-white' : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      {({ isActive }) => (
        <>
          <Icon className={`size-4 shrink-0 ${isActive ? 'text-blue-400' : ''}`} />
          <span className="flex-1">{label}</span>
          {count && counts[count] > 0 && (
            <span className={`text-[11px] font-medium tabular-nums ${count === 'tickets' ? 'text-red-400' : 'text-slate-500'}`}>{counts[count]}</span>
          )}
        </>
      )}
    </NavLink>
  )

  return (
    <div className="h-dvh">
      <div className="relative flex h-full overflow-hidden bg-canvas">
        {open && <div className="absolute inset-0 z-40 bg-slate-900/45 lg:hidden" onClick={() => setOpen(false)} />}

        <aside className={`absolute inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col bg-ink transition-transform lg:static lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="px-5 pt-6 pb-6"><Brand light /></div>

          <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-2" aria-label="Main">
            <div className="space-y-0.5">{MAIN.map(link)}</div>
            {GROUPS.map(({ group, items }) => (
              <div key={group}>
                <p className="mb-1 px-3 text-[11px] font-medium tracking-wide text-slate-600 uppercase">{group}</p>
                <div className="space-y-0.5">{items.map(link)}</div>
              </div>
            ))}
          </nav>

          <div className="mx-3 mb-3 border-t border-white/[0.06] px-3 pt-3">
            <div className="flex items-center gap-2.5">
              <Avatar name={user.full_name} size="sm" />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-[13px] font-medium text-white">{user.full_name}</div>
                <div className="text-[11px] text-slate-500">{ROLE_LABEL[user.role]}</div>
              </div>
              <button type="button" onClick={signOut} className="rounded-md p-1.5 text-slate-500 hover:text-white" aria-label="Sign out" title="Sign out">
                <LogOut className="size-3.5" />
              </button>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200/60 px-4 sm:px-6 lg:px-7">
            <button type="button" className="-ml-1 rounded-lg p-1.5 text-slate-500 hover:text-slate-900 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu className="size-5" />
            </button>
            <nav aria-label="Breadcrumb" className="hidden items-center gap-1.5 text-sm sm:flex">
              <span className="text-slate-400">{GROUPS.find(g => g.items.includes(crumb))?.group ?? 'Workspace'}</span>
              <span className="text-slate-300">/</span>
              <Link to={section} className="font-medium text-slate-900">{crumb.label}</Link>
            </nav>

            <form onSubmit={search} role="search" className="relative ml-auto w-full max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
              <input ref={searchRef} name="q" type="search" placeholder="Search leads…" aria-label="Search leads (Ctrl+K)" className="block w-full rounded-lg border-0 bg-slate-100 py-1.5 pr-14 pl-8 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              <kbd className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded bg-slate-200/70 px-1.5 py-0.5 font-sans text-[11px] text-slate-400 sm:block">⌘K</kbd>
            </form>
            <Reminders />
            <button
              type="button"
              onClick={toggleEyeSafe}
              aria-pressed={warm}
              className={`rounded-lg p-1.5 transition-colors ${warm ? 'bg-ink text-white' : 'text-slate-400 hover:text-slate-900'}`}
              aria-label={warm ? 'Turn off eye-safety mode' : 'Turn on eye-safety mode'}
              title={warm ? 'Eye-safety mode is on' : 'Eye-safety mode'}
            >
              {warm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
            <Link to="/settings" className="rounded-lg p-1.5 text-slate-400 hover:text-slate-900" aria-label="Settings" title="Settings">
              <Settings className="size-4" />
            </Link>
          </header>

          <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-7">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
