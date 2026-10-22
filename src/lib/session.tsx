import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { db, refresh } from './mock/db'
import type { Profile } from './types'

type Session = { user: Profile | null; loading: boolean; signIn: (email: string, password: string) => Promise<void>; signOut: () => Promise<void> }
const Ctx = createContext<Session | null>(null)

export const useProfiles = () => useQuery({ queryKey: ['profiles'], queryFn: () => db.profiles, initialData: () => db.profiles })

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const qc = useQueryClient()

  const loadProfile = async (uid: string) => {
    await refresh()
    setUser(db.profiles.find(p => p.id === uid) ?? null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user.id
      if (uid) loadProfile(uid).finally(() => setLoading(false))
      else setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) loadProfile(session.user.id)
      else { setUser(null); qc.clear() }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
  }
  const signOut = async () => { await supabase.auth.signOut() }

  return <Ctx.Provider value={{ user, loading, signIn, signOut }}>{children}</Ctx.Provider>
}

export const useSession = () => useContext(Ctx)!

/** Only valid under <RequireAuth>. */
export const useUser = () => useSession().user!
