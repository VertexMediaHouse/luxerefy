import { useState } from 'react'
import { Mail, Plus, Shield, Trash2, UserCog, Users2 } from 'lucide-react'
import { Avatar, Badge, Button, Card, CardHeader, Empty, Field, inputCls, Modal, PageHeader } from '../../components/ui'
import { useUser } from '../../lib/session'

const MODULES = ['Dashboard', 'Leads', 'Calendar', 'Tasks', 'Goals', 'Tickets', 'Properties', 'Documents', 'Contacts'] as const

interface Team { id: string; name: string; permissions: Set<string> }
interface Member { id: string; name: string; email: string; teamId: string | null }

const STORAGE_KEY = 'luxerefy-teams'

function loadTeams(): { teams: Team[]; members: Member[] } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const d = JSON.parse(raw)
      return { teams: d.teams.map((t: any) => ({ ...t, permissions: new Set(t.permissions) })), members: d.members }
    }
  } catch { /* fresh */ }
  return {
    teams: [
      { id: 't-sales', name: 'Sales', permissions: new Set(['Dashboard', 'Leads', 'Calendar', 'Tasks', 'Properties', 'Contacts']) },
      { id: 't-dev', name: 'Development', permissions: new Set(['Dashboard', 'Tickets']) },
    ],
    members: [],
  }
}

function saveTeams(teams: Team[], members: Member[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      teams: teams.map(t => ({ ...t, permissions: [...t.permissions] })),
      members,
    }))
  } catch { /* demo storage */ }
}

export function TeamPage() {
  const user = useUser()
  const [{ teams, members }, setState] = useState(loadTeams)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteTeam, setInviteTeam] = useState('')
  const [newTeam, setNewTeam] = useState('')

  const update = (teams: Team[], members: Member[]) => { setState({ teams, members }); saveTeams(teams, members) }

  const togglePerm = (teamId: string, mod: string) => {
    const next = teams.map(t => {
      if (t.id !== teamId) return t
      const p = new Set(t.permissions)
      p.has(mod) ? p.delete(mod) : p.add(mod)
      return { ...t, permissions: p }
    })
    update(next, members)
  }

  const addTeam = () => {
    if (!newTeam.trim()) return
    update([...teams, { id: 't-' + Date.now(), name: newTeam.trim(), permissions: new Set(['Dashboard']) }], members)
    setNewTeam('')
  }

  const removeTeam = (id: string) => {
    update(teams.filter(t => t.id !== id), members.filter(m => m.teamId !== id))
  }

  const invite = () => {
    if (!inviteEmail.trim()) return
    const m: Member = { id: 'm-' + Date.now(), name: inviteEmail.split('@')[0], email: inviteEmail.trim(), teamId: inviteTeam || null }
    update(teams, [...members, m])
    setInviteEmail('')
    setInviteOpen(false)
  }

  const removeMember = (id: string) => update(teams, members.filter(m => m.id !== id))

  return (
    <>
      <PageHeader icon={UserCog} title="Team & roles" subtitle="Manage teams and control what each team can access" actions={<Button onClick={() => setInviteOpen(true)}><Plus className="size-4" /> Invite member</Button>} />

      <Card className="mb-4">
        <CardHeader icon={Shield} title="Owner" subtitle="Full access to everything" />
        <div className="flex items-center gap-3 px-5 py-4">
          <Avatar name={user.full_name} size="md" />
          <div>
            <span className="block text-sm font-semibold text-slate-900">{user.full_name}</span>
            <span className="text-xs text-slate-500">{user.email}</span>
          </div>
          <span className="ml-auto"><Badge tone="blue">Owner</Badge></span>
        </div>
      </Card>

      <Card className="mb-4">
        <CardHeader icon={Users2} title="Teams" subtitle="Each team gets access to selected modules" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-4 py-3 text-left font-semibold text-slate-900">Team</th>
                {MODULES.map(m => <th key={m} className="px-2 py-3 text-center text-xs font-medium text-slate-500">{m}</th>)}
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {teams.map(t => (
                <tr key={t.id} className="border-b border-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{t.name}</td>
                  {MODULES.map(m => (
                    <td key={m} className="px-2 py-3 text-center">
                      <input type="checkbox" checked={t.permissions.has(m)} onChange={() => togglePerm(t.id, m)} className="size-4 accent-blue-600" aria-label={`${t.name} can access ${m}`} />
                    </td>
                  ))}
                  <td className="px-3 py-3">
                    <button type="button" onClick={() => removeTeam(t.id)} className="text-slate-400 hover:text-red-600" aria-label={`Delete ${t.name}`}>
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3">
          <input value={newTeam} onChange={e => setNewTeam(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTeam()} className={`${inputCls} max-w-48`} placeholder="New team name" />
          <Button variant="secondary" onClick={addTeam}>Add team</Button>
        </div>
      </Card>

      {members.length > 0 && (
        <Card>
          <CardHeader icon={Mail} title="Invited members" subtitle="Shared via email — they see only their team's modules" />
          <ul className="divide-y divide-slate-100">
            {members.map(m => (
              <li key={m.id} className="flex items-center gap-3 px-5 py-3">
                <Avatar name={m.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-900">{m.email}</span>
                  <span className="text-xs text-slate-500">{teams.find(t => t.id === m.teamId)?.name ?? 'No team'}</span>
                </div>
                <button type="button" onClick={() => removeMember(m.id)} className="text-slate-400 hover:text-red-600" aria-label="Remove">
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {members.length === 0 && <Empty icon={Mail}>No invited members yet. Use "Invite member" to share access via email.</Empty>}

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite a member">
        <div className="grid gap-4">
          <Field label="Email address *"><input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} type="email" className={inputCls} placeholder="name@company.com" /></Field>
          <Field label="Team">
            <select value={inviteTeam} onChange={e => setInviteTeam(e.target.value)} className={inputCls}>
              <option value="">No team</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={invite}>Send invite</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
