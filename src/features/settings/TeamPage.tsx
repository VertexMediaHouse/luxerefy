import { UserCog } from 'lucide-react'
import { Avatar, Badge, Card, ErrorText, inlineInputCls, PageHeader, RecordCount, T } from '../../components/ui'
import { useProfiles, useUser } from '../../lib/session'
import { ROLE_LABEL } from '../../lib/labels'
import { prettyPhone } from '../../lib/format'
import type { Role } from '../../lib/types'
import { openLeadCount as openLeads, useUpdateProfile } from './api'

export function TeamPage() {
  const user = useUser()
  const { data: profiles } = useProfiles()
  const isOwner = user.role === 'owner'
  const update = useUpdateProfile()

  return (
    <>
      <PageHeader icon={UserCog} tint="text-violet-500" title="Team and roles" subtitle={isOwner ? 'Set who is an owner, manager or agent. Agents only see their own leads.' : 'Only the owner can change roles.'} />
      <ErrorText error={update.error} />
      <Card className="mt-2">
        <div className="overflow-x-auto">
          <table className={T.table}>
            <thead className={T.head}>
              <tr>
                <th className={T.th}>Name</th>
                <th className={`${T.th} hidden md:table-cell`}>Email</th>
                <th className={`${T.th} hidden lg:table-cell`}>Mobile</th>
                <th className={`${T.th} hidden text-right sm:table-cell`}>Open leads</th>
                <th className={T.th}>Role</th>
                {isOwner && <th className={T.th}>Active</th>}
              </tr>
            </thead>
            <tbody className={T.body}>
              {profiles.map(p => (
                <tr key={p.id} className={p.active ? '' : 'opacity-55'}>
                  <td className={T.td}>
                    <span className="flex items-center gap-2.5">
                      <Avatar name={p.full_name} size="sm" />
                      <span className="font-semibold text-slate-900">{p.full_name}</span>
                      {p.id === user.id && <span className="text-xs text-slate-400">(you)</span>}
                    </span>
                  </td>
                  <td className={`${T.td} hidden text-slate-600 md:table-cell`}>{p.email}</td>
                  <td className={`${T.td} hidden whitespace-nowrap text-slate-600 lg:table-cell`}>{prettyPhone(p.phone)}</td>
                  <td className={`${T.td} hidden text-right font-medium text-slate-800 sm:table-cell`}>{openLeads(p.id)}</td>
                  <td className={T.td}>
                    {isOwner && p.id !== user.id ? (
                      <select value={p.role} onChange={e => update.mutate({ id: p.id, role: e.target.value as Role })} className={`${inlineInputCls} py-1`} aria-label={`Role for ${p.full_name}`}>
                        {Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    ) : <Badge tone={p.role === 'agent' ? 'slate' : 'blue'}>{ROLE_LABEL[p.role]}</Badge>}
                  </td>
                  {isOwner && (
                    <td className={T.td}>
                      {p.id !== user.id && <input type="checkbox" checked={p.active} onChange={e => update.mutate({ id: p.id, active: e.target.checked })} className="size-4 accent-blue-600" aria-label={`${p.full_name} is active`} />}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <RecordCount shown={profiles.length} total={profiles.length} noun="team members" />
      </Card>
      <p className="mt-4 text-xs text-slate-500">New members are invited through Supabase Auth once the backend is connected; they start as agents.</p>
    </>
  )
}
