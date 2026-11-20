import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

// Read credentials from .env.local
const envFile = path.resolve(process.cwd(), '.env.local')
let url = process.env.VITE_SUPABASE_URL || ''
let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (fs.existsSync(envFile)) {
  const raw = fs.readFileSync(envFile, 'utf8')
  const mUrl = raw.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim()
  const mKey = raw.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim()
  if (mUrl) url = mUrl
  if (mKey) serviceKey = mKey
}

if (!url || !serviceKey) {
  console.error('Missing Supabase URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function seed() {
  console.log('--- Seeding Sales Demo Data ---')

  // 1. Ensure Admin User
  const adminEmail = 'siddharth@luxerefy.com'
  let adminId = ''
  const { data: users } = await supabase.auth.admin.listUsers()
  const existingAdmin = users?.users?.find(u => u.email === adminEmail)
  if (existingAdmin) {
    adminId = existingAdmin.id
    console.log(`Found existing Admin (${adminEmail}): ${adminId}`)
  } else {
    const { data: newAdmin, error: aErr } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: 'AdminPassword@123',
      email_confirm: true,
      user_metadata: { full_name: 'Siddharth Udani', role: 'owner' },
    })
    if (aErr) throw aErr
    adminId = newAdmin.user.id
    console.log(`Created Admin (${adminEmail}): ${adminId}`)
  }

  await supabase.from('profiles').upsert({
    id: adminId,
    full_name: 'Siddharth Udani',
    email: adminEmail,
    phone: '+919825000001',
    role: 'owner',
    active: true,
  })

  // 2. Ensure 2 Sales Users
  const salesUsers = [
    {
      name: 'Priya Sharma',
      email: 'priya.sales@luxerefy.com',
      password: 'Password@123',
      phone: '+919825112233',
    },
    {
      name: 'Rahul Patel',
      email: 'rahul.sales@luxerefy.com',
      password: 'Password@123',
      phone: '+919825445566',
    },
  ]

  const salesIds: string[] = []
  for (const s of salesUsers) {
    const existing = users?.users?.find(u => u.email === s.email)
    let sId = ''
    if (existing) {
      sId = existing.id
      console.log(`Found existing Sales Rep (${s.email}): ${sId}`)
      await supabase.auth.admin.updateUserById(sId, {
        password: s.password,
        user_metadata: { full_name: s.name, phone: s.phone, role: 'sales', force_password_change: false },
      })
    } else {
      const { data: newSales, error: sErr } = await supabase.auth.admin.createUser({
        email: s.email,
        password: s.password,
        email_confirm: true,
        user_metadata: { full_name: s.name, phone: s.phone, role: 'sales', force_password_change: false },
      })
      if (sErr) throw sErr
      sId = newSales.user.id
      console.log(`Created Sales Rep (${s.email}): ${sId}`)
    }

    await supabase.from('profiles').upsert({
      id: sId,
      full_name: s.name,
      email: s.email,
      phone: s.phone,
      role: 'sales',
      active: true,
    })
    salesIds.push(sId)
  }

  const priyaId = salesIds[0]
  const rahulId = salesIds[1]

  // 3. Ensure Default Pipeline
  const plId = 'pl-1'
  await supabase.from('pipelines').upsert({ id: plId, name: 'Sales pipeline', position: 0 })

  // 4. Sample Contacts and Leads
  const demoLeads = [
    {
      contact: { name: 'Aarav Mehta', phone: '+919879100001', email: 'aarav@example.com' },
      lead: {
        source: '99acres',
        status: 'pl-1-visit',
        property_interest: 'The Universe 4 BHK',
        city: 'Ahmedabad',
        budget_min: 50000000,
        budget_max: 60000000,
        assigned_to: priyaId,
        notes: 'Requested Sunday 11 AM site visit with family.',
        raw_payload: { group: '99acres Campaign' },
      },
      assignmentMethod: 'Round-robin Distribution',
    },
    {
      contact: { name: 'Diya Shah', phone: '+919879100002', email: 'diya@example.com' },
      lead: {
        source: 'social_media',
        status: 'pl-1-won',
        property_interest: 'Aurelia Sky Villa',
        city: 'Ahmedabad',
        budget_min: 60000000,
        budget_max: 70000000,
        assigned_to: priyaId,
        notes: 'Token advance cleared. Agreement drafting in progress.',
        raw_payload: { group: 'Instagram Leads' },
      },
      assignmentMethod: 'Manual Selection',
    },
    {
      contact: { name: 'Kabir Verma', phone: '+919879100003', email: 'kabir@example.com' },
      lead: {
        source: 'website',
        status: 'pl-1-new',
        property_interest: 'Ambli Crest Penthouse',
        city: 'Ahmedabad',
        budget_min: 45000000,
        budget_max: 50000000,
        assigned_to: priyaId,
        notes: 'Inquired via luxury landing page form.',
        raw_payload: { group: 'Website Inquiries' },
      },
      assignmentMethod: 'Filter-based Bulk Assignment',
    },
    {
      contact: { name: 'Ananya Desai', phone: '+919879100004', email: 'ananya@example.com' },
      lead: {
        source: 'referral',
        status: 'pl-1-meeting',
        property_interest: 'Garden Bungalow Thaltej',
        city: 'Ahmedabad',
        budget_min: 85000000,
        budget_max: 95000000,
        assigned_to: rahulId,
        notes: 'Referred by past client. Looking for immediate possession.',
        referral_detail: 'Client referral',
        raw_payload: { group: 'High Budget Investors' },
      },
      assignmentMethod: 'Quota Distribution (20 leads)',
    },
    {
      contact: { name: 'Rohan Joshi', phone: '+919879100005', email: 'rohan@example.com' },
      lead: {
        source: '99acres',
        status: 'pl-1-udnb',
        property_interest: 'Signature Residence SBR',
        city: 'Ahmedabad',
        budget_min: 35000000,
        budget_max: 40000000,
        assigned_to: rahulId,
        notes: 'Evaluating between two properties. Follow-up scheduled.',
        raw_payload: { group: '99acres Campaign' },
      },
      assignmentMethod: 'Group Assignment (99acres Campaign)',
    },
    {
      contact: { name: 'Simran Kaur', phone: '+919879100006', email: 'simran@example.com' },
      lead: {
        source: 'walk_in',
        status: 'pl-1-new',
        property_interest: 'Weekend Plot Sanand',
        city: 'Sanand',
        budget_min: 10000000,
        budget_max: 15000000,
        assigned_to: null, // Unassigned for testing assignment modal
        notes: 'Walk-in at corporate office.',
      },
      assignmentMethod: 'Unassigned',
    },
  ]

  console.log('Inserting contacts, leads, and assignment history…')
  const createdLeadIds: { id: string; assigned_to: string | null }[] = []

  for (const item of demoLeads) {
    // Upsert contact
    let contactId = ''
    const { data: existingContact } = await supabase
      .from('contacts')
      .select('id')
      .eq('phone', item.contact.phone)
      .maybeSingle()

    if (existingContact) {
      contactId = existingContact.id
    } else {
      const { data: newContact, error: cErr } = await supabase
        .from('contacts')
        .insert({
          id: crypto.randomUUID(),
          name: item.contact.name,
          phone: item.contact.phone,
          email: item.contact.email,
          kind: 'lead',
          created_by: adminId,
        })
        .select()
        .single()
      if (cErr) throw cErr
      contactId = newContact.id
    }

    // Insert lead first, then assign so trigger can reference existing lead row
    const leadId = crypto.randomUUID()
    const { error: lErr } = await supabase.from('leads').insert({
      id: leadId,
      contact_id: contactId,
      pipeline_id: plId,
      source: item.lead.source,
      status: item.lead.status,
      property_interest: item.lead.property_interest,
      city: item.lead.city,
      budget_min: item.lead.budget_min,
      budget_max: item.lead.budget_max,
      assigned_to: null,
      notes: item.lead.notes,
      referral_detail: (item.lead as any).referral_detail || null,
      raw_payload: item.lead.raw_payload || {},
      created_at: new Date(Date.now() - Math.floor(Math.random() * 5 * 864e5)).toISOString(),
    })
    if (lErr) console.warn('Lead insert error:', lErr.message)

    if (item.lead.assigned_to) {
      const { error: aErr } = await supabase
        .from('leads')
        .update({ assigned_to: item.lead.assigned_to })
        .eq('id', leadId)
      if (aErr) console.warn('Lead assign update error:', aErr.message)
    }

    createdLeadIds.push({ id: leadId, assigned_to: item.lead.assigned_to })

    // Log assignment activity
    if (item.lead.assigned_to) {
      const repName = item.lead.assigned_to === priyaId ? 'Priya Sharma' : 'Rahul Patel'
      await supabase.from('lead_activities').insert({
        id: crypto.randomUUID(),
        lead_id: leadId,
        type: 'assignment',
        body: `Lead assigned to ${repName} via ${item.assignmentMethod}`,
        actor_id: adminId,
        meta: {
          method: item.assignmentMethod,
          assigned_to: item.lead.assigned_to,
          assignee_name: repName,
        },
        created_at: new Date().toISOString(),
      })
    }
  }

  // 5. Sample Tasks for Sales Reps
  const now = new Date()
  const todayDue = new Date(now.getTime() + 2 * 3600 * 1000).toISOString()
  const overdueDue = new Date(now.getTime() - 24 * 3600 * 1000).toISOString()
  const tomorrowDue = new Date(now.getTime() + 26 * 3600 * 1000).toISOString()

  const demoTasks = [
    {
      title: 'Call Aarav Mehta to confirm 4 BHK sky villa site visit',
      kind: 'call',
      assigned_to: priyaId,
      lead_id: createdLeadIds[0]?.id || null,
      due_at: todayDue,
      status: 'pending',
      created_by: adminId, // Assigned by admin
    },
    {
      title: 'Overdue follow-up on token advance documents',
      kind: 'follow_up',
      assigned_to: priyaId,
      lead_id: createdLeadIds[1]?.id || null,
      due_at: overdueDue,
      status: 'pending',
      created_by: priyaId,
    },
    {
      title: 'Prepare project brochure for Kabir Verma',
      kind: 'other',
      assigned_to: priyaId,
      lead_id: createdLeadIds[2]?.id || null,
      due_at: tomorrowDue,
      status: 'pending',
      created_by: priyaId,
    },
    {
      title: 'Site visit with Ananya Desai at Garden Bungalow',
      kind: 'site_visit',
      assigned_to: rahulId,
      lead_id: createdLeadIds[3]?.id || null,
      due_at: todayDue,
      ends_at: new Date(new Date(todayDue).getTime() + 3600 * 1000).toISOString(),
      status: 'pending',
      created_by: adminId, // Assigned by admin
    },
    {
      title: 'Follow-up call on comparison with SBR property',
      kind: 'call',
      assigned_to: rahulId,
      lead_id: createdLeadIds[4]?.id || null,
      due_at: tomorrowDue,
      status: 'pending',
      created_by: rahulId,
    },
  ]

  console.log('Inserting tasks for sales team…')
  for (const t of demoTasks) {
    await supabase.from('tasks').insert({
      id: crypto.randomUUID(),
      title: t.title,
      kind: t.kind,
      assigned_to: t.assigned_to,
      lead_id: t.lead_id,
      due_at: t.due_at,
      ends_at: (t as any).ends_at || null,
      status: t.status,
      created_by: t.created_by,
      created_at: new Date().toISOString(),
    })
  }

  console.log('--- Demo Seed Complete Successfully! ---')
  console.log('Credentials:')
  console.log('Admin:       siddharth@luxerefy.com / AdminPassword@123')
  console.log('Sales Rep 1: priya.sales@luxerefy.com / Password@123')
  console.log('Sales Rep 2: rahul.sales@luxerefy.com / Password@123')
}

seed().catch(err => {
  console.error('Seed script error:', err)
  process.exit(1)
})
