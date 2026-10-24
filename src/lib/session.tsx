// Mock auth. Becomes supabase.auth + the profiles row once connected.
import { createContext, useContext, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { db, respond } from './mock/db'
import type { Profile } from './types'

const KEY = 'luxerefy-crm-user'
const Ctx = createContext<{ user: Profile | null; signIn: (id: string) => void; signOut: () => void } | null>(null)

export const useProfiles = () =>
  useQuery({ queryKey: ['profiles'], queryFn: () => respond(db.profiles), initialData: () => structuredClone(db.profiles) })

export function SessionProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState(() => { try { return localStorage.getItem(KEY) } catch { return null } })
  const { data: profiles } = useProfiles()
  const user = profiles.find(p => p.id === userId && p.active) ?? null
  const persist = (id: string | null) => {
    setUserId(id)
    try { if (id) localStorage.setItem(KEY, id); else localStorage.removeItem(KEY) } catch { /* session lasts this tab only */ }
  }
  return <Ctx.Provider value={{ user, signIn: persist, signOut: () => persist(null) }}>{children}</Ctx.Provider>
}

export const useSession = () => useContext(Ctx)!

/** Only valid under <RequireAuth>. */
export const useUser = () => useSession().user!
