import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { useSession } from '../../lib/session'
import { Button, ErrorText, Field, inputCls, Card } from '../../components/ui'
import { Brand } from '../../components/Layout'
import { KeyRound } from 'lucide-react'

const HERO = 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1600&q=80&auto=format&fit=crop'

export function LoginPage() {
  const { user, blocked, signIn, signOut, mustChangePassword, changePassword } = useSession()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changeError, setChangeError] = useState('')
  const [changing, setChanging] = useState(false)

  if (user && !mustChangePassword) {
    if (user.role === 'sales') {
      return <Navigate to="/sales" replace />
    }
    return <Navigate to="/" replace />
  }

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setBusy(true)
    setError((await signIn(String(f.get('email')).trim().toLowerCase(), String(f.get('password')))) ?? '')
    setBusy(false)
  }

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault()
    if (newPassword.length < 8) {
      setChangeError('Password must be at least 8 characters long.')
      return
    }
    if (newPassword !== confirmPassword) {
      setChangeError('Passwords do not match.')
      return
    }
    setChanging(true)
    setChangeError('')
    const err = await changePassword(newPassword)
    setChanging(false)
    if (err) setChangeError(err)
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
          <div className="lg:hidden mb-6"><Brand /></div>

          {mustChangePassword ? (
            <Card className="p-6">
              <div className="flex items-center gap-2.5 text-blue-600 mb-2">
                <KeyRound className="size-5" />
                <h1 className="text-xl font-semibold text-slate-900">Set New Password</h1>
              </div>
              <p className="text-xs text-slate-500 mb-5">
                Your administrator required a password change on first login. Choose a new secure password to continue.
              </p>

              <form onSubmit={handlePasswordChange} className="space-y-4">
                <Field label="New Password">
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className={inputCls}
                  />
                </Field>
                <Field label="Confirm New Password">
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Re-type password"
                    className={inputCls}
                  />
                </Field>
                <ErrorText error={changeError} />
                <Button type="submit" className="w-full" disabled={changing}>
                  {changing ? 'Updating password…' : 'Update & Continue'}
                </Button>
                <button
                  type="button"
                  onClick={signOut}
                  className="w-full text-center text-xs text-slate-400 hover:text-slate-600 underline"
                >
                  Cancel and Sign out
                </button>
              </form>
            </Card>
          ) : (
            <>
              <h1 className="mt-8 text-2xl font-semibold text-slate-900 lg:mt-0">Sign in to your CRM</h1>
              <p className="mt-1 text-sm text-slate-500">Sign in with your team credentials.</p>

              <form onSubmit={submit} className="mt-8 space-y-4">
                <Field label="Email">
                  <input name="email" type="email" required autoComplete="email" className={inputCls} placeholder="you@luxerefy.com" />
                </Field>
                <Field label="Password">
                  <input name="password" type="password" required autoComplete="current-password" className={inputCls} placeholder="••••••••" />
                </Field>
                <ErrorText error={error || (blocked ? 'This account has no active CRM access. Contact your administrator.' : '')} />
                <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
                {blocked && <button type="button" onClick={signOut} className="w-full text-sm text-slate-500 underline">Sign out</button>}
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
