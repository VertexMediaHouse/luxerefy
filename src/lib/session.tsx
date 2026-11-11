// Mock session: the signed-in user is a profiles row id kept in localStorage.
// ponytail: demo auth, any password works. Restore the Supabase version
// (git show 501716f:src/lib/session.tsx) once a live project exists again.
import { createContext, useContext, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { db, respond } from './db'
import type { Profile } from './types'

interface Ctx {
  user: Profile | null
  /** Signed in but no active profile row (deactivated). */
  blocked: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => void
}
const SessionCtx = createContext<Ctx | null>(null)

const KEY = 'luxerefy-crm-session'

export const useProfiles = () =>
  useQuery({ queryKey: ['profiles'], queryFn: () => respond(db.profiles), initialData: () => structuredClone(db.profiles) })

export function SessionProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(() => {
    try { return localStorage.getItem(KEY) } catch { return null }
  })

  const { data: profiles } = useProfiles()
  const user = profiles.find(p => p.id === userId && p.active) ?? null

  const signIn = async (email: string, _password: string) => {
    const match = db.profiles.find(p => p.email.toLowerCase() === email.trim().toLowerCase())
    if (!match) return 'No account with that email.'
    if (!match.active) return 'Your account is not active.'
    try { localStorage.setItem(KEY, match.id) } catch { /* session just won't survive a reload */ }
    setUserId(match.id)
    return null
  }
  const signOut = () => {
    try { localStorage.removeItem(KEY) } catch { /* nothing to clear */ }
    setUserId(null)
  }

  return (
    <SessionCtx.Provider value={{ user, blocked: !!userId && !user, signIn, signOut }}>{children}</SessionCtx.Provider>
  )
}

export const useSession = () => useContext(SessionCtx)!

/** Only valid under <RequireAuth>. */
export const useUser = () => useSession().user!
