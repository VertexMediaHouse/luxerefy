import { Link } from 'react-router'
import { ChevronRight, DatabaseBackup, Eye, RotateCcw, Settings, UserCog } from 'lucide-react'
import { Button, Card, CardHeader, PageHeader } from '../../components/ui'
import { useUser } from '../../lib/session'
import { toggleEyeSafe, useEyeSafe } from '../../lib/eyeSafe'
import { resetDemo } from '../../lib/mock/db'

const LINKS = [
  { to: '/backup', icon: DatabaseBackup, label: 'Backups', hint: 'Weekly snapshots, download and restore' },
  { to: '/team', icon: UserCog, label: 'Team and roles', hint: 'One desk for now; add people here later' },
]

export function SettingsPage() {
  const user = useUser()
  const warm = useEyeSafe()

  return (
    <>
      <PageHeader icon={Settings} title="Settings" subtitle="How the CRM looks and behaves in this browser" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader icon={Eye} title="Appearance" subtitle="Saved per browser" />
          <div className="p-5">
            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" checked={warm} onChange={toggleEyeSafe} className="mt-0.5 size-4 accent-slate-900" />
              <span className="text-sm">
                <span className="block font-semibold text-slate-800">Eye-safety mode</span>
                <span className="text-slate-500">Warms the whole screen and cuts blue light, for long evenings on the pipeline. The same toggle sits in the top bar.</span>
              </span>
            </label>
          </div>
        </Card>

        <Card>
          <CardHeader title="Account" subtitle="Signed in" />
          <dl className="divide-y divide-slate-100 px-5 text-sm">
            <div className="flex justify-between gap-4 py-3"><dt className="text-slate-500">Name</dt><dd className="font-medium text-slate-900">{user.full_name}</dd></div>
            <div className="flex justify-between gap-4 py-3"><dt className="text-slate-500">Email</dt><dd className="truncate font-medium text-slate-900">{user.email}</dd></div>
            <div className="flex justify-between gap-4 py-3"><dt className="text-slate-500">Mobile</dt><dd className="font-medium text-slate-900">{user.phone}</dd></div>
          </dl>
        </Card>

        <Card>
          <CardHeader title="Elsewhere" />
          <ul className="divide-y divide-slate-100">
            {LINKS.map(({ to, icon: I, label, hint }) => (
              <li key={to}>
                <Link to={to} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50">
                  <I className="size-[18px] shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-900">{label}</span>
                    <span className="block text-xs text-slate-500">{hint}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-slate-300" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader icon={RotateCcw} title="Demo data" subtitle="This build stores everything in your browser" />
          <div className="space-y-3 p-5">
            <p className="text-sm leading-relaxed text-slate-500">
              Resetting throws away every change made here and reloads the original sample workspace. Take a backup first if
              you want to keep anything.
            </p>
            <Button variant="danger" onClick={() => confirm('Reset all demo data to the original sample? This cannot be undone.') && resetDemo()}>
              <RotateCcw className="size-4" /> Reset demo data
            </Button>
          </div>
        </Card>
      </div>
    </>
  )
}
