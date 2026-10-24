import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Check, ChevronRight, DatabaseBackup, Eye, RotateCcw, Settings, UserCog } from 'lucide-react'
import { Button, Card, CardHeader, Field, inputCls, PageHeader } from '../../components/ui'
import { useUser } from '../../lib/session'
import { toggleEyeSafe, useEyeSafe } from '../../lib/eyeSafe'
import { db, resetDemo, save } from '../../lib/mock/db'

const LINKS = [
  { to: '/backup', icon: DatabaseBackup, label: 'Backups', hint: 'Weekly snapshots, download and restore' },
  { to: '/team', icon: UserCog, label: 'Team and roles', hint: 'Manage teams and module access' },
]

export function SettingsPage() {
  const user = useUser()
  const warm = useEyeSafe()
  const [name, setName] = useState(user.full_name)
  const [email, setEmail] = useState(user.email)
  const [phone, setPhone] = useState(user.phone)
  const [saved, setSaved] = useState(false)

  const saveProfile = (e: FormEvent) => {
    e.preventDefault()
    const p = db.profiles.find(p => p.id === user.id)
    if (p) {
      p.full_name = name.trim() || p.full_name
      p.email = email.trim() || p.email
      p.phone = phone.trim() || p.phone
      save()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  return (
    <>
      <PageHeader icon={Settings} title="Settings" subtitle="Profile, appearance and data — everything in one place" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Profile" subtitle="Your details across the CRM" />
          <form onSubmit={saveProfile} className="space-y-4 p-5">
            <Field label="Full name"><input value={name} onChange={e => setName(e.target.value)} className={inputCls} /></Field>
            <Field label="Email"><input value={email} onChange={e => setEmail(e.target.value)} type="email" className={inputCls} /></Field>
            <Field label="Mobile"><input value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} /></Field>
            <Button type="submit">{saved ? <><Check className="size-4" /> Saved</> : 'Save changes'}</Button>
          </form>
        </Card>

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
