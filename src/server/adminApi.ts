// Sales-user management for `vite dev` / `vite preview`. Production runs the same contract from
// public/api/admin/sales-users.php — change both together. Lead assignment is not here: it is the
// assign_leads() SQL function, called straight from the browser.
import type { IncomingMessage, ServerResponse } from 'http'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loadEnv } from 'vite'

const MANAGER_ROLES = ['owner', 'admin', 'manager']
const BAN_FOREVER = '876000h'

function getSupabaseAdmin() {
  const env = loadEnv('', process.cwd(), '')
  const url = env.VITE_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase URL or Service Role Key missing in server environment')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function parseBody(req: IncomingMessage): Promise<any> {
  let data = ''
  for await (const chunk of req) data += chunk
  return data ? JSON.parse(data) : {}
}

function sendJson(res: ServerResponse, status: number, body: any) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

/** The caller's profile if their bearer token is valid and they are an active manager; otherwise null. */
async function authorize(sb: SupabaseClient, req: IncomingMessage) {
  const token = req.headers.authorization?.replace(/^Bearer /, '')
  if (!token) return null
  const { data } = await sb.auth.getUser(token)
  if (!data.user) return null
  const { data: p } = await sb.from('profiles').select('id, role, active, must_change_password').eq('id', data.user.id).single()
  return p && p.active && !p.must_change_password && MANAGER_ROLES.includes(p.role) ? p : null
}

/** Deactivating bans the login and frees the rep's leads back to the unassigned pool. */
async function setActive(sb: SupabaseClient, id: string, active: boolean) {
  const { error } = await sb.auth.admin.updateUserById(id, { ban_duration: active ? 'none' : BAN_FOREVER })
  if (error) throw error
  if (!active) {
    const { error: e } = await sb.from('leads').update({ assigned_to: null }).eq('assigned_to', id)
    if (e) throw e
  }
}

export async function handleAdminApi(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const pathname = (req.url || '').split('?')[0]
  if (pathname === '/api/admin/ticket-email' && req.method === 'POST') return ticketEmail(req, res)
  if (!pathname.startsWith('/api/admin/sales-users')) return next()
  const method = req.method || 'GET'

  try {
    const sb = getSupabaseAdmin()
    const caller = await authorize(sb, req)
    if (!caller) return sendJson(res, 403, { error: 'Managers only' })

    if (pathname === '/api/admin/sales-users' && method === 'GET') {
      // ponytail: one page of 1000 auth users; loop on `page` if the team ever gets that big.
      const { data: authData, error: authErr } = await sb.auth.admin.listUsers({ perPage: 1000 })
      if (authErr) throw authErr
      const [{ data: profiles }, { data: leads }, { data: tasks }] = await Promise.all([
        sb.from('profiles').select('*'),
        sb.from('leads').select('assigned_to, status'),
        sb.from('tasks').select('assigned_to, status'),
      ])

      const users = authData.users.flatMap(u => {
        const p = profiles?.find(x => x.id === u.id)
        if (!p) return []
        const assigned = leads?.filter(l => l.assigned_to === u.id) ?? []
        const won = assigned.filter(l => l.status.endsWith('-won')).length
        return [{
          id: u.id,
          email: u.email,
          full_name: p.full_name,
          phone: p.phone,
          role: p.role,
          active: p.active,
          is_sales: p.role === 'sales',
          last_login: u.last_sign_in_at || null,
          created_at: u.created_at,
          force_password_change: p.must_change_password,
          assigned_leads_count: assigned.length,
          open_tasks_count: tasks?.filter(t => t.assigned_to === u.id && t.status === 'pending').length ?? 0,
          won_deals: won,
          conversion_rate: assigned.length ? Math.round((won / assigned.length) * 100) : 0,
        }]
      })
      return sendJson(res, 200, { users })
    }

    if (pathname === '/api/admin/sales-users' && method === 'POST') {
      const { name, email, password, phone = '', active = true, force_password_change = true } = await parseBody(req)
      if (!email || !password || !name) return sendJson(res, 400, { error: 'Name, email, and password are required' })

      const { data: created, error: createErr } = await sb.auth.admin.createUser({
        email: email.trim().toLowerCase(),
        password,
        email_confirm: true,
        user_metadata: { full_name: name.trim(), phone: phone.trim() },
      })
      if (createErr) throw createErr
      const id = created.user.id

      // handle_new_user made an inactive sales row; this sets what the admin asked for.
      const { error: profErr } = await sb.from('profiles').update({
        full_name: name.trim(), phone: phone.trim(), role: 'sales', active: !!active,
        must_change_password: !!force_password_change, created_by: caller.id,
      }).eq('id', id)
      if (profErr) throw profErr
      if (!active) await setActive(sb, id, false)

      return sendJson(res, 201, { user: { id, email, full_name: name, phone, role: 'sales', active, force_password_change } })
    }

    const idMatch = pathname.match(/^\/api\/admin\/sales-users\/([0-9a-f-]{36})$/)
    if (!idMatch) return sendJson(res, 404, { error: 'Endpoint not found' })
    const id = idMatch[1]
    const { data: target } = await sb.from('profiles').select('role').eq('id', id).single()
    if (target?.role !== 'sales') return sendJson(res, 403, { error: 'Only sales users can be managed here' })

    if (method === 'PATCH') {
      const { name, phone, active, password, force_password_change } = await parseBody(req)
      // Password first: its trigger clears must_change_password, the profile update below sets it again.
      if (password) {
        const { error } = await sb.auth.admin.updateUserById(id, { password })
        if (error) throw error
      }
      const prof: Record<string, unknown> = {}
      if (name !== undefined) prof.full_name = name
      if (phone !== undefined) prof.phone = phone
      if (active !== undefined) prof.active = !!active
      if (force_password_change !== undefined) prof.must_change_password = !!force_password_change
      if (Object.keys(prof).length) {
        const { error } = await sb.from('profiles').update(prof).eq('id', id)
        if (error) throw error
      }
      if (active !== undefined) await setActive(sb, id, !!active)
      return sendJson(res, 200, { success: true, id })
    }

    if (method === 'DELETE') {
      const { error } = await sb.from('profiles').update({ active: false }).eq('id', id)
      if (error) throw error
      await setActive(sb, id, false)
      return sendJson(res, 200, { success: true, id, soft_deleted: true })
    }

    return sendJson(res, 404, { error: 'Endpoint not found' })
  } catch (err: any) {
    console.error('Admin API error:', err)
    return sendJson(res, 500, { error: err.message || 'Internal server error' })
  }
}

/** Emails a new ticket via Resend. Only the ticket's raiser can trigger it; content is read from the DB,
 *  so the endpoint can't be used to send arbitrary mail. Same contract as public/api/admin/ticket-email.php. */
async function ticketEmail(req: IncomingMessage, res: ServerResponse) {
  try {
    const env = loadEnv('', process.cwd(), '')
    if (!env.RESEND_API_KEY) return sendJson(res, 500, { error: 'RESEND_API_KEY missing' })
    const sb = getSupabaseAdmin()
    const token = req.headers.authorization?.replace(/^Bearer /, '')
    const user = token ? (await sb.auth.getUser(token)).data.user : null
    const { id } = await parseBody(req)
    const { data: t } = await sb.from('tickets').select('number, title, description, raised_by').eq('id', id).single()
    if (!user || !t || t.raised_by !== user.id) return sendJson(res, 403, { error: 'Not your ticket' })
    const { data: p } = await sb.from('profiles').select('full_name').eq('id', user.id).single()
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.TICKET_EMAIL_FROM || 'Luxerefy CRM <onboarding@resend.dev>',
        to: env.TICKET_EMAIL_TO || 'dhrumil@vertexmediahouse.com',
        subject: `[Ticket #${t.number}] ${t.title}`,
        text: `${t.description}\n\n— Raised by ${p?.full_name ?? user.email}`,
      }),
    })
    const body: any = await r.json().catch(() => ({}))
    return sendJson(res, r.ok ? 200 : 502, r.ok ? { success: true } : { error: body.message || 'Email failed' })
  } catch (err: any) {
    return sendJson(res, 500, { error: err.message || 'Internal server error' })
  }
}
