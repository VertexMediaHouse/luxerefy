import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { Building2, CalendarDays, CheckSquare, ChevronDown, Contact2, DatabaseBackup, Eye, EyeOff, FileText, LayoutDashboard, LifeBuoy, LogOut, Menu, Search, Settings, Target, Users, UserCog } from 'lucide-react'
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
      <span className="flex size-8 items-center justify-center rounded-[10px] bg-blue-600 font-brand text-base font-bold text-white">L</span>
      <span className={`text-lg font-semibold tracking-tight ${light ? 'text-white' : 'text-slate-900'}`}>Luxerefy</span>
      <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${light ? 'bg-white/10 text-blue-200' : 'bg-blue-50 text-blue-700'}`}>CRM</span>
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
  const CrumbIcon = crumb.icon

  const link = ({ to, label, icon: Icon, end, count }: Item) => (
    <NavLink
      key={to}
      to={to}
      end={end}
      onClick={() => setOpen(false)}
      className={({ isActive }) => `group/link flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-colors ${
        isActive ? 'bg-white/[0.09] font-medium text-white' : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-100'
      }`}
    >
      {({ isActive }) => (
        <>
          <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors ${isActive ? 'bg-blue-600 text-white' : 'bg-white/[0.06] text-slate-400 group-hover/link:text-slate-200'}`}>
            <Icon className="size-[15px]" />
          </span>
          <span className="flex-1">{label}</span>
          {count && counts[count] > 0 && (
            <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${count === 'tickets' ? 'bg-red-500/15 text-red-300' : 'bg-white/10 text-slate-300'}`}>{counts[count]}</span>
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
          <div className="px-5 pt-5 pb-4"><Brand light /></div>

          <div className="mx-3 mb-4 flex items-center gap-2.5 rounded-xl bg-white/[0.05] p-2.5 ring-1 ring-white/[0.06]">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white">AU</span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-[11px] text-slate-500">Workspace</span>
              <span className="block truncate text-sm font-medium text-white">Ahmedabad Luxury</span>
            </span>
          </div>

          <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-2" aria-label="Main">
            <div className="space-y-1">{MAIN.map(link)}</div>
            {GROUPS.map(({ group, items }) => (
              <details key={group} open className="group/nav">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold tracking-wider text-slate-600 uppercase hover:text-slate-400 [&::-webkit-details-marker]:hidden">
                  <ChevronDown className="size-3 -rotate-90 transition-transform group-open/nav:rotate-0" /> {group}
                </summary>
                <div className="mt-1 space-y-1">{items.map(link)}</div>
              </details>
            ))}
          </nav>

          <div className="mx-3 mb-3 rounded-xl bg-white/[0.05] p-2.5 ring-1 ring-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <Avatar name={user.full_name} size="md" />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-sm font-medium text-white">{user.full_name}</div>
                <div className="text-xs text-slate-500">{ROLE_LABEL[user.role]}</div>
              </div>
              <button type="button" onClick={signOut} className="rounded-md p-1.5 text-slate-500 hover:bg-white/10 hover:text-white" aria-label="Sign out" title="Sign out">
                <LogOut className="size-4" />
              </button>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200/70 px-4 sm:px-6 lg:px-7">
            <button type="button" className="-ml-1 rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu className="size-5" />
            </button>
            <nav aria-label="Breadcrumb" className="hidden items-center gap-2 text-sm sm:flex">
              <span className="text-slate-400">{GROUPS.find(g => g.items.includes(crumb))?.group ?? 'Workspace'}</span>
              <span className="text-slate-300">/</span>
              <Link to={section} className="flex items-center gap-1.5 font-medium text-slate-900">
                <CrumbIcon className="size-4 text-blue-600" /> {crumb.label}
              </Link>
            </nav>

            <form onSubmit={search} role="search" className="relative ml-auto w-full max-w-sm">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <input ref={searchRef} name="q" type="search" placeholder="Search leads by name, phone or property…" aria-label="Search leads (Ctrl+K)" className="block w-full rounded-xl border-0 bg-white py-2 pr-14 pl-9 text-sm text-slate-900 shadow-soft ring-1 ring-slate-200/80 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              <kbd className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded-md bg-slate-100 px-1.5 py-0.5 font-sans text-[11px] text-slate-500 sm:block">Ctrl K</kbd>
            </form>
            <Reminders />
            <button
              type="button"
              onClick={toggleEyeSafe}
              aria-pressed={warm}
              className={`rounded-lg p-2 transition-colors ${warm ? 'bg-ink text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}
              aria-label={warm ? 'Turn off eye-safety mode' : 'Turn on eye-safety mode'}
              title={warm ? 'Eye-safety mode is on' : 'Eye-safety mode'}
            >
              {warm ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
            </button>
            <Link to="/settings" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="Settings" title="Settings">
              <Settings className="size-[18px]" />
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
