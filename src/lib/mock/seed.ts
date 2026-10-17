import type { Lead, LeadSource, Property, Stage, Tables, Ticket, TicketPriority, TicketStatus, Tone } from '../types'
import { SOURCE_LABEL } from '../labels'
import { FOLLOW_UP_TEMPLATE, slaDue } from '../rules'

/** The default board. Reserved keys new/won/lost carry the stage semantics - see rules.ts. */
const PL = 'pl-1'
type StageKey = 'new' | 'visit' | 'udnb' | 'meeting' | 'won' | 'lost'
const STAGE_DEFS: [StageKey, string, Tone, Stage['kind']][] = [
  ['new', 'New Lead', 'slate', 'entry'],
  ['visit', 'Potential Visit', 'blue', 'open'],
  ['udnb', 'UDNB', 'amber', 'open'],
  ['meeting', 'Potential Meeting', 'violet', 'open'],
  ['won', 'Won', 'green', 'won'],
  ['lost', 'Lost', 'red', 'lost'],
]
const S = (k: StageKey) => PL + '-' + k
const LABEL = (k: StageKey) => STAGE_DEFS.find(d => d[0] === k)![1]

const H = 3600e3
const at = (hoursFromNow: number) => new Date(Date.now() + hoursFromNow * H).toISOString()
const img = (id: string) => `https://images.unsplash.com/photo-${id}?w=1600&q=80&auto=format&fit=crop`
const CR = 1e7
/** Seeded appointments start on the hour between 10 am and 6 pm so the calendar looks real. */
const slot = (hoursFromNow: number, length = 0) => {
  const d = new Date(Date.now() + hoursFromNow * H)
  d.setHours(Math.min(18, Math.max(10, d.getHours())), 0, 0, 0)
  return new Date(d.getTime() + length * H).toISOString()
}

export function seed(): Tables {
  const profiles: Tables['profiles'] = [
    { id: 'u-owner', full_name: 'Siddharth Udani', email: 'siddharth@luxerefy.com', phone: '+919825000001', role: 'owner', active: true },
    { id: 'u-mgr', full_name: 'Kavya Shah', email: 'kavya@luxerefy.com', phone: '+919825000002', role: 'manager', active: true },
    { id: 'u-a1', full_name: 'Arjun Patel', email: 'arjun@luxerefy.com', phone: '+919825000003', role: 'agent', active: true },
    { id: 'u-a2', full_name: 'Meera Desai', email: 'meera@luxerefy.com', phone: '+919825000004', role: 'agent', active: true },
    { id: 'u-a3', full_name: 'Nikhil Joshi', email: 'nikhil@luxerefy.com', phone: '+919825000005', role: 'agent', active: true },
  ]

  const amenities = ['Private pool', 'Clubhouse', 'Gymnasium', 'Home automation', '24×7 security', 'EV charging', 'Landscaped garden', 'Concierge', 'Staff quarters', 'Power backup']
  const prop = (slug: string, p: Omit<Property, 'id' | 'slug' | 'city' | 'created_at' | 'updated_at'>, age: number): Property =>
    ({ id: 'p-' + slug, slug, city: 'Ahmedabad', created_at: at(-age), updated_at: at(-age / 2), ...p })

  const properties: Property[] = [
    prop('aurelia-sky-villa-shela', {
      title: 'Aurelia Sky Villa', project: 'Aurelia Residences', config: '5 BHK Sky Villa', area_sqft: 6200, price: 6.5 * CR, locality: 'Shela',
      description: 'A double-height sky villa with a private plunge pool, wraparound sundeck and uninterrupted views over the Shela greens. Italian marble throughout, a chef\'s kitchen and a private lift lobby.',
      amenities: amenities.slice(0, 8), images: ['1600596542815-ffad4c1539a9', '1600607687939-ce8a6c25118c', '1600566753190-17f0baa2a6c3', '1600210492486-724fe5c67fb0'].map(img),
      specs: { Possession: 'Ready to move', Facing: 'East', Floors: '14th & 15th (duplex)', Parking: '3 covered', Furnishing: 'Semi-furnished' }, status: 'available', is_public: true,
    }, 900),
    prop('ambli-crest-penthouse', {
      title: 'The Ambli Crest Penthouse', project: 'Ambli Crest', config: '4 BHK Penthouse', area_sqft: 5400, price: 4.8 * CR, locality: 'Ambli',
      description: 'Top-floor penthouse with a 1,200 sq ft private terrace, jacuzzi deck and floor-to-ceiling glazing. Minutes from Iscon Cross Road and SP Ring Road.',
      amenities: [amenities[1], amenities[2], amenities[3], amenities[4], amenities[7]], images: ['1613490493576-7fde63acd811', '1600566753086-00f18fb6b3ea', '1616594039964-ae9021a400a0'].map(img),
      specs: { Possession: 'Dec 2026', Facing: 'North-East', Floor: '22nd (top)', Parking: '3 covered', Furnishing: 'Bare shell' }, status: 'available', is_public: true,
    }, 700),
    prop('thaltej-garden-bungalow', {
      title: 'Garden Bungalow, Thaltej', project: 'Independent', config: '5 BHK Bungalow', area_sqft: 8500, price: 9.2 * CR, locality: 'Thaltej',
      description: 'A contemporary independent bungalow on a 1,000 sq yd plot with a landscaped lawn, lap pool, home theatre and a separate staff block.',
      amenities: [amenities[0], amenities[3], amenities[4], amenities[5], amenities[6], amenities[8], amenities[9]], images: ['1600585154340-be6161a56a0c', '1600047509807-ba8f99d2cdde', '1618221195710-dd6b41faaea6'].map(img),
      specs: { Possession: 'Ready to move', Plot: '1,000 sq yd', Facing: 'West', Parking: '4 cars', Furnishing: 'Fully furnished' }, status: 'available', is_public: true,
    }, 500),
    prop('sbr-signature-residence', {
      title: 'Signature Residence, Sindhu Bhavan Road', project: 'The Signature', config: '4 BHK Apartment', area_sqft: 3900, price: 3.6 * CR, locality: 'Sindhu Bhavan Road',
      description: 'One apartment per floor on Ahmedabad\'s most sought-after boulevard. Private lift, 12 ft ceilings and a clubhouse with an indoor pool.',
      amenities: amenities.slice(1, 7), images: ['1512917774080-9991f1c4c750', '1600607687644-c7171b42498f', '1600573472550-8090b5e0745e'].map(img),
      specs: { Possession: 'Ready to move', Facing: 'East', Floor: '9th', Parking: '2 covered', Furnishing: 'Semi-furnished' }, status: 'reserved', is_public: true,
    }, 400),
    prop('prahlad-nagar-duplex', {
      title: 'Prahlad Nagar Duplex', project: 'Garden Court', config: '3 BHK Duplex', area_sqft: 2800, price: 2.4 * CR, locality: 'Prahlad Nagar',
      description: 'Garden-facing duplex next to Prahlad Nagar Garden. Draft listing — photos and specs pending from the developer.',
      amenities: [amenities[1], amenities[2], amenities[4]], images: ['1564013799919-ab600027ffc6', '1502672260266-1c1ef2d93688'].map(img),
      specs: { Possession: 'Mar 2027', Facing: 'South', Parking: '2 covered' }, status: 'available', is_public: false,
    }, 60),
    prop('science-city-villa', {
      title: 'Science City Villa', project: 'Orchid Greens', config: '4 BHK Villa', area_sqft: 5000, price: 5.1 * CR, locality: 'Science City',
      description: 'Gated-community villa with a private garden and rooftop entertainment deck.',
      amenities: amenities.slice(0, 6), images: ['1580587771525-78b9dba3b914', '1560448204-e02f11c3d0e2', '1605276374104-dee2a0ed3cd6'].map(img),
      specs: { Possession: 'Ready to move', Facing: 'North', Parking: '3 covered' }, status: 'sold', is_public: false,
    }, 1200),
  ]

  // name, phone, source, stage, property index | interest, budget (Cr), agent, hours ago
  const rows: [string, string, LeadSource, StageKey, number | string, [number, number], string, number][] = [
    ['Rohan Mehta', '+919876543210', '99acres', 'new', 0, [6, 7], 'u-a1', 3],
    ['Priya Shah', '+919821012345', 'website', 'visit', 1, [4, 5], 'u-a2', 50],
    ['Vikram Singh', '+919537677889', '99acres', 'udnb', 2, [8, 10], 'u-a3', 120],
    ['Sneha Joshi', '+919000123456', 'referral', 'lost', 3, [2.5, 3], 'u-a1', 480],
    ['Amit Desai', '+919312345678', '99acres', 'visit', '4 BHK in Bodakdev', [3, 4], 'u-a2', 75],
    ['Neha Patel', '+919898765432', 'whatsapp', 'new', 1, [4, 5], 'u-a3', 20],
    ['Karan Thakkar', '+919724455667', 'property_page', 'meeting', 0, [6, 7], 'u-a1', 170],
    ['Isha Trivedi', '+919925511223', '99acres', 'won', 5, [5, 5.5], 'u-a2', 720],
    ['Rahul Agarwal', '+14155550142', 'website', 'visit', 2, [8, 9.5], 'u-a3', 96],
    ['Pooja Sharma', '+919811122334', '99acres', 'new', '3 BHK duplex, Prahlad Nagar', [2, 2.5], 'u-a1', 1],
    ['Harsh Vora', '+919426677889', 'walk_in', 'meeting', 3, [3.5, 4], 'u-a2', 216],
    ['Anjali Mehta', '+919099887766', '99acres', 'lost', 4, [2, 2.4], 'u-a3', 360],
    ['Devansh Parikh', '+919737373737', 'referral', 'won', 3, [3.5, 3.8], 'u-a1', 600],
    ['Ritu Kapoor', '+447700900123', 'website', 'new', 0, [6, 7], 'u-a2', 6],
    ['Sahil Khan', '+919512345670', '99acres', 'udnb', '5 BHK bungalow, Thaltej', [8, 10], 'u-a3', 140],
    ['Kunal Shah', '+919879001122', 'whatsapp', 'udnb', 1, [4.5, 5], 'u-a1', 240],
    ['Tanvi Desai', '+919601234567', 'property_page', 'new', 2, [9, 10], 'u-a3', 26],
    ['Manish Jain', '+919825567890', '99acres', 'visit', 0, [6, 6.5], 'u-a2', 44],
  ]

  const t: Tables = {
    profiles, properties, contacts: [], leads: [], lead_activities: [], tasks: [], tickets: [], documents: [],
    pipelines: [{ id: PL, name: 'Sales pipeline', position: 0, created_at: at(-2000) }],
    stages: STAGE_DEFS.map(([key, label, tone, kind], i) => ({ id: S(key), pipeline_id: PL, label, tone, position: i, kind })),
  }
  const name = (id: string) => profiles.find(p => p.id === id)!.full_name
  let n = 0
  const act = (lead_id: string, type: Tables['lead_activities'][number]['type'], body: string, actor_id: string | null, created_at: string, meta = {}) =>
    t.lead_activities.push({ id: `a-${++n}`, lead_id, type, body, actor_id, created_at, meta })

  rows.forEach(([cname, phone, source, status, interest, [bmin, bmax], agent, age], i) => {
    const created = at(-age)
    const property = typeof interest === 'number' ? properties[interest] : null
    t.contacts.push({ id: `c-${i}`, name: cname, phone, email: `${cname.split(' ')[0].toLowerCase()}@example.com`, kind: status === 'won' ? 'client' : 'lead', created_by: null, created_at: created })
    const lead: Lead = {
      id: `l-${i}`, contact_id: `c-${i}`, source, pipeline_id: PL, status: S(status), property_id: property?.id ?? null,
      property_interest: property ? `${property.config}, ${property.locality}` : (interest as string),
      budget_min: bmin * CR, budget_max: bmax * CR, city: phone.startsWith('+91') ? 'Ahmedabad' : 'Overseas (NRI)',
      assigned_to: agent, external_ref: source === '99acres' ? `99A-${48210 + i}` : null,
      lost_reason: status === 'lost' ? (i % 2 ? 'Bought elsewhere' : 'Budget mismatch') : null, created_at: created, updated_at: created,
    }
    t.leads.push(lead)
    const system = ['99acres', 'property_page', 'whatsapp'].includes(source)
    act(lead.id, 'created', `Lead captured from ${SOURCE_LABEL[source]}`, system ? null : agent, created)
    act(lead.id, 'assignment', `Assigned to ${name(agent)}`, null, created)
    if (source === '99acres') act(lead.id, 'whatsapp', `Auto follow-up template "${FOLLOW_UP_TEMPLATE}" sent on WhatsApp`, null, created, { template: FOLLOW_UP_TEMPLATE, direction: 'out', status: 'sent', wa_id: `wamid.seed${i}` })
    if (source === 'whatsapp') act(lead.id, 'whatsapp', 'WhatsApp received: "Hi, is this property still available? Please share brochure."', null, created, { direction: 'in', wa_id: `wamid.in${i}` })

    const PATH: Record<StageKey, StageKey[]> = {
      new: [], visit: ['visit'], udnb: ['visit', 'udnb'], meeting: ['visit', 'udnb', 'meeting'],
      won: ['visit', 'udnb', 'meeting', 'won'], lost: ['visit', 'lost'],
    }
    const path = PATH[status]
    let prev: StageKey = 'new'
    path.forEach((s, k) => {
      const when = at(-age + (age * (k + 1)) / (path.length + 1))
      if (s === 'visit') act(lead.id, 'call', 'Call — discussed requirements and shared brochure on WhatsApp', agent, when, { minutes: 6 })
      if (s === 'udnb') act(lead.id, 'note', 'Budget confirmed, wants a site visit with family this weekend', agent, when)
      if (s === 'meeting') act(lead.id, 'note', 'Site visit done — bringing the family in for a closing meeting', agent, when)
      act(lead.id, 'status_change', `Stage changed from ${LABEL(prev)} to ${LABEL(s)}${s === 'lost' ? ` — ${lead.lost_reason}` : ''}`, agent, when)
      prev = s
    })

    if (status !== 'won' && status !== 'lost') {
      const due = [-20, 2, 26, 50][i % 4]
      t.tasks.push({ id: `t-${i}`, title: `Follow up with ${cname}`, kind: 'follow_up', lead_id: lead.id, property_id: lead.property_id, assigned_to: agent, due_at: slot(due), ends_at: null, status: 'pending', created_by: agent, created_at: created })
      if (status === 'udnb' || status === 'meeting') t.tasks.push({ id: `t-v${i}`, title: `Site visit — ${property?.title ?? lead.property_interest}`, kind: 'site_visit', lead_id: lead.id, property_id: lead.property_id, assigned_to: agent, due_at: slot(24 + i * 6), ends_at: slot(24 + i * 6, 1), status: 'pending', created_by: agent, created_at: created })
    }
  })

  t.contacts.push(
    { id: 'c-v1', name: 'Studio Aangan Interiors', phone: '+919824011223', email: 'hello@aangan.example.com', kind: 'vendor', created_by: 'u-owner', created_at: at(-2000) },
    { id: 'c-v2', name: 'Adv. Jignesh Bhatt (Title & Legal)', phone: '+919825044556', email: 'jbhatt@example.com', kind: 'vendor', created_by: 'u-mgr', created_at: at(-1500) },
    { id: 'c-v3', name: 'Rakesh Modi (Home Loans DSA)', phone: '+919727088990', email: null, kind: 'vendor', created_by: 'u-a1', created_at: at(-900) },
  )

  const task = (id: string, title: string, kind: Tables['tasks'][number]['kind'], assigned_to: string, from: number, hours: number | null, extra: Partial<Tables['tasks'][number]> = {}) =>
    t.tasks.push({ id, title, kind, assigned_to, due_at: slot(from), ends_at: hours ? slot(from, hours) : null, status: 'pending', lead_id: null, property_id: null, created_by: 'u-mgr', created_at: at(-48), ...extra })
  task('t-m1', 'Weekly sales review', 'meeting', 'u-mgr', 20, 1)
  task('t-m2', 'Developer meeting — Aurelia pricing', 'meeting', 'u-owner', 52, 1.5, { property_id: properties[0].id })
  task('t-m3', 'Photo shoot — Prahlad Nagar Duplex', 'other', 'u-a1', 74, 2, { property_id: properties[4].id })
  task('t-d1', 'Collect KYC from Isha Trivedi', 'documents', 'u-a2', -200, null, { lead_id: 'l-7', status: 'done' })
  task('t-d2', 'Owner approval — Signature Residence payment plan', 'approval', 'u-owner', 6, null, { lead_id: 'l-10', property_id: properties[3].id })
  task('t-v0', 'Site visit — Science City Villa', 'site_visit', 'u-a2', -400, 1, { lead_id: 'l-7', property_id: properties[5].id, status: 'done' })

  const doc = (id: string, name: string, folder: Tables['documents'][number]['folder'], kb: number, age: number, link: { lead?: string; property?: string }, by = 'u-mgr') =>
    t.documents.push({ id, name, folder, size: kb * 1024, mime: 'application/pdf', storage_path: '', lead_id: link.lead ?? null, property_id: link.property ?? null, uploaded_by: by, created_at: at(-age) })
  doc('d-1', 'Aurelia — Floor plans (14th & 15th).pdf', 'Property', 2400, 800, { property: properties[0].id })
  doc('d-2', 'Aurelia Residences — Brochure.pdf', 'Property', 5800, 850, { property: properties[0].id })
  doc('d-3', 'Ambli Crest — Price list Q4.pdf', 'Property', 310, 300, { property: properties[1].id })
  doc('d-4', 'Sale Agreement — Isha Trivedi.pdf', 'Agreements', 1200, 300, { lead: 'l-7', property: properties[5].id }, 'u-a2')
  doc('d-5', 'KYC — Isha Trivedi (PAN, Aadhaar).pdf', 'KYC', 900, 400, { lead: 'l-7' }, 'u-a2')
  doc('d-6', 'Booking receipt — ₹25 L.pdf', 'Payments', 150, 320, { lead: 'l-7' }, 'u-a2')
  doc('d-7', 'Allotment letter — Devansh Parikh.pdf', 'Agreements', 450, 200, { lead: 'l-12', property: properties[3].id }, 'u-a1')
  doc('d-8', 'Title search report — Thaltej plot.pdf', 'Property', 3100, 450, { property: properties[2].id })

  const ticket = (number: number, title: string, description: string, priority: TicketPriority, status: TicketStatus, age: number, raised_by: string, assigned_to: string | null, link: { lead?: number; property?: number } = {}): Ticket => {
    const created = at(-age)
    return {
      id: `tk-${number}`, number, title, description, priority, status, raised_by, assigned_to, created_at: created,
      lead_id: link.lead != null ? `l-${link.lead}` : null, property_id: link.property != null ? properties[link.property].id : null,
      sla_due_at: slaDue(created, priority), escalation_level: 0, escalated_at: null,
      in_progress_at: status !== 'pending' ? at(-age + 1) : null, resolved_at: status === 'resolved' ? at(-age + 20) : null,
    }
  }
  t.tickets = [
    ticket(1, 'Duplicate contact for Amit Desai', 'Amit shows twice in contacts with different number formats.', 'low', 'resolved', 96, 'u-a2', 'u-mgr', { lead: 4 }),
    ticket(2, 'Property images not loading on share link', 'Client says the Sky Villa link shows blank images on his phone.', 'normal', 'pending', 60, 'u-a1', null, { property: 0 }),
    ticket(3, 'Update floor plan PDF for Aurelia', 'Developer shared revised floor plans for the 15th floor.', 'normal', 'in_progress', 20, 'u-mgr', 'u-a1', { property: 0 }),
    ticket(4, '99acres SMS not forwarding from Meera’s phone', 'No 99acres leads captured from Meera’s number since yesterday evening.', 'high', 'in_progress', 10, 'u-a2', 'u-mgr'),
    ticket(5, 'Client wants revised payment schedule', 'Harsh Vora asked for a 40:60 payment plan on the Signature Residence.', 'urgent', 'pending', 2, 'u-a2', 'u-a2', { lead: 10, property: 3 }),
  ]
  return t
}
