import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { useSession } from '../../lib/session'
import { Button, ErrorText, Field, inputCls } from '../../components/ui'
import { Brand } from '../../components/Layout'

const HERO = 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1600&q=80&auto=format&fit=crop'

export function LoginPage() {
  const { user, signIn } = useSession()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (user) return <Navigate to="/" replace />

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setError('')
    setBusy(true)
    try {
      await signIn(String(form.get('email')).trim().toLowerCase(), String(form.get('password')))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
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
            <Field label="Password"><input name="password" type="password" required autoComplete="current-password" className={inputCls} placeholder="••••••••" /></Field>
            <ErrorText error={error} />
            <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
          </form>
        </div>
      </div>
    </div>
  )
}
