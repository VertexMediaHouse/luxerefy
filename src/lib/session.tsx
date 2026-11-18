// Real Supabase Auth. The signed-in user is their `profiles` row, which the on_auth_user_created
// trigger creates on sign-up (the first account becomes the owner).
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { db, refresh } from './db'
import type { Profile } from './types'

interface Ctx {
  user: Profile | null
  /** Signed in but no active profile row (deactivated). */
  blocked: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => void
}
const SessionCtx = createContext<Ctx | null>(null)

export const useProfiles = () =>
  useQuery({ queryKey: ['profiles'], queryFn: () => Promise.resolve(db.profiles), initialData: () => db.profiles })

export function SessionProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null)
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
      setReady(true)
    }
    supabase.auth.getSession().then(({ data }) => sync(data.session?.user.id ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) void sync(session.user.id)
      else { qc.clear(); void sync(null) }
    })
    return () => { live = false; sub.subscription.unsubscribe() }
  }, [qc])

  const user = profiles.find(p => p.id === userId && p.active) ?? null

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    return error ? error.message : null
  }
  const signOut = () => { void supabase.auth.signOut() }

  if (!ready) return null

  return (
    <SessionCtx.Provider value={{ user, blocked: !!userId && !user, signIn, signOut }}>{children}</SessionCtx.Provider>
  )
}

export const useSession = () => useContext(SessionCtx)!

/** Only valid under <RequireAuth>. */
export const useUser = () => useSession().user!
