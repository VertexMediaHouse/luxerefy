import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { ArrowRight } from 'lucide-react'
import { useProfiles, useSession } from '../../lib/session'
import { ROLE_LABEL } from '../../lib/labels'
import { Avatar, Button, ErrorText, Field, inputCls } from '../../components/ui'
import { Brand } from '../../components/Layout'

const HERO = 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1600&q=80&auto=format&fit=crop'

export function LoginPage() {
  const { user, signIn } = useSession()
  const { data: profiles } = useProfiles()
  const [error, setError] = useState('')
  if (user) return <Navigate to="/" replace />

  // Placeholder for supabase.auth.signInWithPassword: any password works for a demo email.
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const email = String(new FormData(e.currentTarget).get('email')).trim().toLowerCase()
    const match = profiles.find(p => p.active && p.email === email)
    if (match) signIn(match.id)
    else setError('No account with that email. Use one of the demo accounts below.')
  }

  return (
    <div className="grid min-h-dvh bg-canvas lg:grid-cols-2">
      <div className="relative hidden lg:block">
        <img src={HERO} alt="" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/50 to-ink/10" />
        <div className="absolute inset-x-0 bottom-0 p-12 text-white">
          <Brand light />
          <p className="mt-6 max-w-md text-2xl leading-snug font-bold">Every enquiry captured. Every follow-up on time.</p>
          <p className="mt-2 max-w-md text-white/70">Leads from 99acres, social media, your website and referrals land in one place — tracked and followed up.</p>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden"><Brand /></div>
          <h1 className="mt-8 text-2xl font-semibold text-slate-900 lg:mt-0">Sign in to your CRM</h1>
          <p className="mt-1 text-sm text-slate-500">Accounts are invite-only.</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <Field label="Email"><input name="email" type="email" required autoComplete="email" className={inputCls} placeholder="you@luxerefy.com" /></Field>
            <Field label="Password"><input name="password" type="password" autoComplete="current-password" className={inputCls} placeholder="••••••••" /></Field>
            <ErrorText error={error} />
            <Button type="submit" className="w-full">Sign in</Button>
          </form>

          <div className="mt-10">
            <p className="text-sm font-semibold text-slate-700">Or use the demo account</p>
            <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl bg-white shadow-card ring-1 ring-slate-900/[0.07]">
              {profiles.filter(p => p.active).map(p => (
                <li key={p.id}>
                  <button type="button" onClick={() => signIn(p.id)} className="group flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
                    <Avatar name={p.full_name} size="sm" />
                    <span className="flex-1">
                      <span className="block text-sm font-semibold text-slate-900">{p.full_name}</span>
                      <span className="block text-xs text-slate-500">{ROLE_LABEL[p.role]}, {p.email}</span>
                    </span>
                    <ArrowRight className="size-4 text-slate-300 group-hover:text-slate-900" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
