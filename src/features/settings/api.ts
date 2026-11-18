import { useMutation } from '@tanstack/react-query'
import { db, ok, write } from '../../lib/db'
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
        // The guard_profile trigger enforces this too; here it just gives the clearer message.
        if (user.role !== 'owner') throw new Error('Only the owner can change roles.')
        if (id === user.id) throw new Error("You can't change your own role or access.")
        ok(await supabase.from('profiles').update(patch).eq('id', id))
      }),
  })
}
