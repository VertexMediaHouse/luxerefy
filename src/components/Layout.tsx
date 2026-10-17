import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { Building2, CalendarDays, CheckSquare, ChevronDown, Contact2, DatabaseBackup, FileText, KanbanSquare, LayoutDashboard, LifeBuoy, LogOut, Menu, Plus, RotateCcw, Search, SlidersHorizontal, Users, UserCog } from 'lucide-react'
import { Reminders } from '../features/tasks/Reminders'
import { useReminders } from '../features/tasks/api'
import { useLeads } from '../features/leads/api'
import { useTickets } from '../features/tickets/api'
import { useProfiles, useSession, useUser } from '../lib/session'
import { ROLE_LABEL } from '../lib/labels'
import { resetDemo } from '../lib/mock/db'
import { weeklyBackup } from '../lib/backup'
import { Avatar } from './ui'

type Counter = 'leads' | 'tasks' | 'tickets'
type Item = { to: string; label: string; icon: typeof Users; end?: boolean; count?: Counter }
const MAIN: Item[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/leads', label: 'Leads', icon: Users, count: 'leads' },
  { to: '/pipeline', label: 'Pipeline', icon: KanbanSquare },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare, count: 'tasks' },
  { to: '/tickets', label: 'Tickets', icon: LifeBuoy, count: 'tickets' },
]
const GROUPS: { group: string; items: Item[] }[] = [
  { group: 'Records', items: [
    { to: '/contacts', label: 'Contacts', icon: Contact2 },
    { to: '/properties', label: 'Properties', icon: Building2 },
    { to: '/documents', label: 'Documents', icon: FileText },
  ] },
  { group: 'Admin', items: [
    { to: '/pipelines', label: 'Pipeline setup', icon: SlidersHorizontal },
    { to: '/team', label: 'Team & roles', icon: UserCog },
    { to: '/backup', label: 'Backups', icon: DatabaseBackup },
  ] },
]
const PAGE = Object.fromEntries([...MAIN, ...GROUPS.flatMap(g => g.items)].map(i => [i.to, i]))

export function Brand({ light }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-[9px] bg-ink font-brand text-base font-bold text-[#e3c27a]">L</span>
      <span className={`text-lg font-semibold tracking-tight ${light ? 'text-white' : 'text-slate-900'}`}>Luxerefy</span>
      {!light && <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">CRM</span>}
    </div>
  )
}

export function Layout() {
  const [open, setOpen] = useState(false)
  const user = useUser()
  const { signIn, signOut } = useSession()
  const { data: profiles } = useProfiles()
  const nav = useNavigate()
  const { pathname } = useLocation()
  const searchRef = useRef<HTMLInputElement>(null)

  const { data: leads = [] } = useLeads()
  const { data: reminders = [] } = useReminders()
  const { data: tickets = [] } = useTickets()
  const counts: Record<Counter, number> = {
    leads: leads.filter(l => l.status === 'new').length,
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
      className={({ isActive }) => `flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${isActive ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'}`}
    >
      <Icon className="size-[18px] text-slate-500" />
      <span className="flex-1">{label}</span>
      {count && counts[count] > 0 && <span className={`text-xs font-medium tabular-nums ${count === 'tickets' ? 'text-red-500' : 'text-slate-500'}`}>{counts[count]}</span>}
    </NavLink>
  )

  return (
    <div className="min-h-dvh lg:pl-64">
      {open && <div className="fixed inset-0 z-40 bg-black/20 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200/80 bg-white transition-transform max-lg:shadow-pop lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="px-5 pt-5 pb-5"><Brand /></div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-3" aria-label="Main">
          <div className="space-y-0.5">{MAIN.map(link)}</div>
          {GROUPS.map(({ group, items }) => (
            <details key={group} open className="group/nav">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] text-slate-400 hover:text-slate-600 [&::-webkit-details-marker]:hidden">
                <ChevronDown className="size-3.5 -rotate-90 transition-transform group-open/nav:rotate-0" /> {group}
              </summary>
              <div className="mt-0.5 space-y-0.5">{items.map(link)}</div>
            </details>
          ))}
        </nav>

        <div className="space-y-0.5 px-3 pb-2">
          <button type="button" onClick={() => confirm('Reset all demo data to the original sample?') && resetDemo()} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900">
            <RotateCcw className="size-[18px] text-slate-500" /> Reset demo data
          </button>
        </div>
        <div className="mx-3 mb-3 rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-200/70">
          <div className="flex items-center gap-2.5">
            <Avatar name={user.full_name} size="sm" />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-medium text-slate-900">{user.full_name}</div>
              <div className="text-xs text-slate-500">{ROLE_LABEL[user.role]}</div>
            </div>
            <button type="button" onClick={signOut} className="rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-slate-700" aria-label="Sign out" title="Sign out">
              <LogOut className="size-4" />
            </button>
          </div>
          <select
            className="mt-2 block w-full rounded-md border-0 bg-white py-1 pl-2 text-xs text-slate-600 ring-1 ring-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            value={user.id}
            onChange={e => signIn(e.target.value)}
            aria-label="View the app as another demo user"
          >
            {profiles.filter(p => p.active).map(p => <option key={p.id} value={p.id}>View as {p.full_name} ({ROLE_LABEL[p.role]})</option>)}
          </select>
        </div>
      </aside>

      <div className="relative min-h-dvh bg-[radial-gradient(60rem_22rem_at_100%_0%,rgb(16_185_129/0.06),transparent_70%)]">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200/70 bg-white/70 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <button type="button" className="-ml-1 rounded-md p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <nav aria-label="Breadcrumb" className="hidden items-center gap-2 text-sm sm:flex">
            <span className="text-slate-400">{GROUPS.find(g => g.items.includes(crumb))?.group ?? 'Workspace'}</span>
            <span className="text-slate-300">/</span>
            <Link to={section} className="flex items-center gap-1.5 font-medium text-slate-900">
              <CrumbIcon className="size-4 text-slate-500" /> {crumb.label}
            </Link>
          </nav>

          <form onSubmit={search} role="search" className="relative ml-auto w-full max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input ref={searchRef} name="q" type="search" placeholder="Search leads by name, phone or property…" aria-label="Search leads (Ctrl+K)" className="block w-full rounded-xl border-0 bg-white py-2 pr-14 pl-9 text-sm text-slate-900 shadow-soft ring-1 ring-slate-200/80 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
            <kbd className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded-md bg-slate-50 px-1.5 py-0.5 font-sans text-[11px] text-slate-500 ring-1 ring-slate-200 sm:block">Ctrl K</kbd>
          </form>
          <Reminders />
          <Link to="/leads?new=1" className="hidden items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-soft hover:bg-slate-700 md:inline-flex">
            <Plus className="size-4" /> New lead
          </Link>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-7">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
