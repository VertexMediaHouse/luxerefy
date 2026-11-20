import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { db, refresh } from '../../lib/db'
import { supabase } from '../../lib/supabase'

export interface SalesUserData {
  id: string
  email: string
  full_name: string
  phone: string
  role: string
  active: boolean
  is_sales: boolean
  last_login: string | null
  created_at: string
  force_password_change: boolean
  assigned_leads_count: number
  open_tasks_count: number
  won_deals: number
  conversion_rate: number
}

const pick = (chars: string) => chars[crypto.getRandomValues(new Uint32Array(1))[0] % chars.length]

/** One upper, lower, digit and symbol up front, so it passes any complexity rule; temp password, changed on first login. */
export function generateStrongPassword(length = 14): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%^&*-_+']
  return [...sets, ...Array(length - sets.length).fill(sets.join(''))].map(pick).join('')
}

/** Calls the admin API with the signed-in user's token; the server refuses anyone but managers. */
async function adminFetch(path: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession()
  const res = await fetch(`/api/admin/sales-users${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
  })
  const body = await res.json().catch(() => ({ error: `Admin API unavailable (HTTP ${res.status})` }))
  if (!res.ok) throw new Error(body.error || `Admin API failed (HTTP ${res.status})`)
  return body
}

export function useSalesUsers() {
  return useQuery({
    queryKey: ['sales-users'],
    queryFn: async (): Promise<SalesUserData[]> => (await adminFetch('')).users,
  })
}

/** After any change: re-pull the mirror (profiles, freed leads) and the team list. */
function useAdminMutation<T>(fn: (arg: T) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (arg: T) => {
      const out = await fn(arg)
      await refresh().catch(() => {})
      return out
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sales-users'] })
      void qc.invalidateQueries({ queryKey: ['profiles'] })
    },
  })
}

export function useCreateSalesUser() {
  return useAdminMutation(async (payload: {
    name: string
    email: string
    password: string
    phone?: string
    active?: boolean
    force_password_change?: boolean
  }) => (await adminFetch('', { method: 'POST', body: JSON.stringify(payload) })).user)
}

export function useUpdateSalesUser() {
  return useAdminMutation(({ id, ...patch }: {
    id: string
    name?: string
    phone?: string
    active?: boolean
    password?: string
    force_password_change?: boolean
  }) => adminFetch(`/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }))
}

export function useDeleteSalesUser() {
  return useAdminMutation((id: string) => adminFetch(`/${id}`, { method: 'DELETE' }))
}

export function useSalesUserDetail(id: string) {
  const { data: users = [] } = useSalesUsers()
  return useQuery({
    queryKey: ['sales-user-detail', id, users],
    queryFn: () => {
      const user = users.find(u => u.id === id) || null
      const leads = db.leads.filter(l => l.assigned_to === id)
      const tasks = db.tasks.filter(t => t.assigned_to === id)
      const activities = db.lead_activities
        .filter(a => leads.some(l => l.id === a.lead_id) || a.actor_id === id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))

      return {
        user,
        leads,
        tasks,
        activities,
      }
    },
    enabled: !!id,
  })
}
