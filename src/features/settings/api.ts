import { useMutation } from '@tanstack/react-query'
import { db, write } from '../../lib/mock/db'
import { supabase } from '../../lib/supabase'
import { isOpen } from '../../lib/rules'
import { useUser } from '../../lib/session'
import type { Profile } from '../../lib/types'

export const openLeadCount = (id: string) => db.leads.filter(l => l.assigned_to === id && isOpen(l)).length

export function useUpdateProfile() {
  const user = useUser()
  return useMutation({
    mutationFn: ({ id, ...patch }: Pick<Profile, 'id'> & Partial<Pick<Profile, 'role' | 'active'>>) =>
      write(async () => {
        if (user.role !== 'owner') throw new Error('Only the owner can change roles.')
        if (id === user.id) throw new Error("You can't change your own role or access.")
        const { error } = await supabase.from('profiles').update(patch).eq('id', id)
        if (error) throw new Error(error.message)
      }),
  })
}
