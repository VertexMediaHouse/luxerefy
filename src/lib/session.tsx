// Real Supabase Auth. The signed-in user is their `profiles` row, which the on_auth_user_created
// trigger creates on sign-up (the first account becomes the owner).
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { db, refresh } from './db'
import { isManager } from './rules'
import type { Profile } from './types'

interface Ctx {
  user: Profile | null
  actualUser: Profile | null
  isImpersonating: boolean
  startImpersonating: (target: Partial<Profile> & { id: string }) => void
  stopImpersonating: () => void
  /** Signed in but no active profile row (deactivated). */
  blocked: boolean
  mustChangePassword: boolean
  changePassword: (newPassword: string) => Promise<string | null>
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => void
}
const SessionCtx = createContext<Ctx | null>(null)
const IMPERSONATE_KEY = 'luxerefy_impersonated_user'

export const useProfiles = () =>
  useQuery({ queryKey: ['profiles'], queryFn: () => Promise.resolve(db.profiles), initialData: () => db.profiles })

export function SessionProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null)
  // Only the id is stored; the profile is looked up fresh, and only a manager may impersonate.
  const [impersonatedId, setImpersonatedId] = useState<string | null>(() => {
    try { return sessionStorage.getItem(IMPERSONATE_KEY) } catch { return null }
  })
  // The mirror has to be filled before the first render: the public pages and stages.ts read `db`
  // synchronously, with no hook to suspend on.
  const [ready, setReady] = useState(false)
  const [profiles, setProfiles] = useState<Profile[]>(db.profiles)
  const qc = useQueryClient()

  useEffect(() => {
    let live = true
    const sync = async (id: string | null) => {
      // A failed refresh (project unreachable) must not leave the app stuck on a blank screen.
      await refresh().catch(e => console.error('Supabase load failed:', e))
      if (!live) return
      setProfiles([...db.profiles])
      setUserId(id)
      if (!id) clearImpersonation()

      setReady(true)
    }
    supabase.auth.getSession().then(({ data }) => sync(data.session?.user.id ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) void sync(session.user.id)
      else { qc.clear(); void sync(null) }
    })
    return () => { live = false; sub.subscription.unsubscribe() }
  }, [qc])

  // Leads arrive from outside this tab (public form, webhooks), so re-pull the mirror whenever the tab regains focus.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState !== 'visible') return
      refresh().then(() => { setProfiles([...db.profiles]); void qc.invalidateQueries() }).catch(() => {})
    }
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('focus', onFocus)
    return () => { document.removeEventListener('visibilitychange', onFocus); window.removeEventListener('focus', onFocus) }
  }, [qc])

  const actualUser = profiles.find(p => p.id === userId && p.active) ?? null
  // The database enforces this flag too (my_role() is NULL until the password changes).
  const mustChangePassword = !!actualUser?.must_change_password
  const impersonatedUser = actualUser && isManager(actualUser)
    ? profiles.find(p => p.id === impersonatedId && p.active && p.role === 'sales') ?? null
    : null
  const effectiveUser = impersonatedUser ?? actualUser

  const clearImpersonation = () => {
    setImpersonatedId(null)
    try { sessionStorage.removeItem(IMPERSONATE_KEY) } catch { /* storage blocked */ }
  }

  const startImpersonating = (target: { id: string }) => {
    setImpersonatedId(target.id)
    try { sessionStorage.setItem(IMPERSONATE_KEY, target.id) } catch { /* storage blocked */ }
    void qc.invalidateQueries()
  }

  const stopImpersonating = () => {
    clearImpersonation()
    void qc.invalidateQueries()
  }

  const changePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) return error.message
    // A trigger on auth.users cleared must_change_password; re-pull so the profile (and RLS data) catch up.
    await refresh().catch(() => {})
    setProfiles([...db.profiles])
    void qc.invalidateQueries()
    return null
  }

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    return error ? error.message : null
  }

  const signOut = () => {
    clearImpersonation()
    void supabase.auth.signOut()
  }

  if (!ready) return null

  return (
    <SessionCtx.Provider
      value={{
        user: effectiveUser,
        actualUser,
        isImpersonating: !!impersonatedUser,
        startImpersonating,
        stopImpersonating,
        blocked: !!userId && !actualUser,
        mustChangePassword,
        changePassword,
        signIn,
        signOut,
      }}
    >
      {children}
    </SessionCtx.Provider>
  )
}

export const useSession = () => useContext(SessionCtx)!

/** Only valid under <RequireAuth>. */
export const useUser = () => useSession().user!
