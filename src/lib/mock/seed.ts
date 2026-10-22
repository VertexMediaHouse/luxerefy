import type { Goal, GoalMetric, GoalPeriod, Lead, LeadSource, Property, Stage, Tables, Ticket, TicketPriority, TicketStatus, Tone } from '../types'
import { SOURCE_LABEL } from '../labels'
import { slaDue } from '../rules'

/** The default board. Reserved keys new/won/lost carry the stage semantics - see rules.ts. */
const PL = 'pl-1'
type StageKey = 'new' | 'visit' | 'udnb' | 'meeting' | 'future' | 'won' | 'lost'
const STAGE_DEFS: [StageKey, string, Tone, Stage['kind']][] = [
  ['new', 'New Lead', 'slate', 'entry'],
  ['visit', 'Potential Visit', 'blue', 'open'],
  ['udnb', 'UDNB', 'amber', 'open'],
  ['meeting', 'Potential Meeting', 'violet', 'open'],
  ['future', 'Future Leads', 'slate', 'open'],
  ['won', 'Won', 'green', 'won'],
  ['lost', 'Lost', 'red', 'lost'],
]
const S = (k: StageKey) => PL + '-' + k
const LABEL = (k: StageKey) => STAGE_DEFS.find(d => d[0] === k)![1]

const OWNER = 'u-owner'
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

type LeadExtra = { also?: number[]; referral?: string; notes?: string }

export function seed(): Tables {
  // One desk. Roles stay in the schema so a second person is a row, not a rewrite.
  const profiles: Tables['profiles'] = [
    { id: OWNER, full_name: 'Siddharth Udani', email: 'siddharth@luxerefy.com', phone: '+919825000001', role: 'owner', active: true },
  ]

  const amenities = ['Private pool', 'Clubhouse', 'Gymnasium', 'Home automation', '24×7 security', 'EV charging', 'Landscaped garden', 'Concierge', 'Staff quarters', 'Power backup']
  const prop = (slug: string, p: Omit<Property, 'id' | 'slug' | 'city' | 'created_at' | 'updated_at'>, age: number): Property =>
    ({ id: 'p-' + slug, slug, city: 'Ahmedabad', created_at: at(-age), updated_at: at(-age / 2), ...p })

  const properties: Property[] = [
    prop('aurelia-sky-villa-shela', {
      title: 'Aurelia Sky Villa', project: 'Aurelia Residences', config: '5 BHK Sky Villa', area_sqft: 6200, price: 6.5 * CR, locality: 'Shela',
      segment: 'residential', category: 'apartment',
      description: 'A double-height sky villa with a private plunge pool, wraparound sundeck and uninterrupted views over the Shela greens. Italian marble throughout, a chef\'s kitchen and a private lift lobby.',
      amenities: amenities.slice(0, 8), images: ['1600596542815-ffad4c1539a9', '1600607687939-ce8a6c25118c', '1600566753190-17f0baa2a6c3', '1600210492486-724fe5c67fb0'].map(img),
      specs: { Possession: 'Ready to move', Facing: 'East', Floors: '14th & 15th (duplex)', Parking: '3 covered', Furnishing: 'Semi-furnished' }, status: 'available', is_public: true,
    }, 900),
    prop('ambli-crest-penthouse', {
      title: 'The Ambli Crest Penthouse', project: 'Ambli Crest', config: '4 BHK Penthouse', area_sqft: 5400, price: 4.8 * CR, locality: 'Ambli',
      segment: 'residential', category: 'apartment',
      description: 'Top-floor penthouse with a 1,200 sq ft private terrace, jacuzzi deck and floor-to-ceiling glazing. Minutes from Iscon Cross Road and SP Ring Road.',
      amenities: [amenities[1], amenities[2], amenities[3], amenities[4], amenities[7]], images: ['1613490493576-7fde63acd811', '1600566753086-00f18fb6b3ea', '1616594039964-ae9021a400a0'].map(img),
      specs: { Possession: 'Dec 2026', Facing: 'North-East', Floor: '22nd (top)', Parking: '3 covered', Furnishing: 'Bare shell' }, status: 'available', is_public: true,
    }, 700),
    prop('thaltej-garden-bungalow', {
      title: 'Garden Bungalow, Thaltej', project: 'Independent', config: '5 BHK Bungalow', area_sqft: 8500, price: 9.2 * CR, locality: 'Thaltej',
      segment: 'residential', category: 'bungalow',
      description: 'A contemporary independent bungalow on a 1,000 sq yd plot with a landscaped lawn, lap pool, home theatre and a separate staff block.',
      amenities: [amenities[0], amenities[3], amenities[4], amenities[5], amenities[6], amenities[8], amenities[9]], images: ['1600585154340-be6161a56a0c', '1600047509807-ba8f99d2cdde', '1618221195710-dd6b41faaea6'].map(img),
      specs: { Possession: 'Ready to move', Plot: '1,000 sq yd', Facing: 'West', Parking: '4 cars', Furnishing: 'Fully furnished' }, status: 'available', is_public: true,
    }, 500),
    prop('sbr-signature-residence', {
      title: 'Signature Residence, Sindhu Bhavan Road', project: 'The Signature', config: '4 BHK Apartment', area_sqft: 3900, price: 3.6 * CR, locality: 'Sindhu Bhavan Road',
      segment: 'residential', category: 'apartment',
      description: 'One apartment per floor on Ahmedabad\'s most sought-after boulevard. Private lift, 12 ft ceilings and a clubhouse with an indoor pool.',
      amenities: amenities.slice(1, 7), images: ['1512917774080-9991f1c4c750', '1600607687644-c7171b42498f', '1600573472550-8090b5e0745e'].map(img),
      specs: { Possession: 'Ready to move', Facing: 'East', Floor: '9th', Parking: '2 covered', Furnishing: 'Semi-furnished' }, status: 'reserved', is_public: true,
    }, 400),
    prop('prahlad-nagar-duplex', {
      title: 'Prahlad Nagar Duplex', project: 'Garden Court', config: '3 BHK Duplex', area_sqft: 2800, price: 2.4 * CR, locality: 'Prahlad Nagar',
      segment: 'residential', category: 'apartment',
      description: 'Garden-facing duplex next to Prahlad Nagar Garden. Draft listing — photos and specs pending from the developer.',
      amenities: [amenities[1], amenities[2], amenities[4]], images: ['1564013799919-ab600027ffc6', '1502672260266-1c1ef2d93688'].map(img),
      specs: { Possession: 'Mar 2027', Facing: 'South', Parking: '2 covered' }, status: 'available', is_public: false,
    }, 60),
    prop('science-city-villa', {
      title: 'Science City Villa', project: 'Orchid Greens', config: '4 BHK Villa', area_sqft: 5000, price: 5.1 * CR, locality: 'Science City',
      segment: 'residential', category: 'bungalow',
      description: 'Gated-community villa with a private garden and rooftop entertainment deck.',
      amenities: amenities.slice(0, 6), images: ['1580587771525-78b9dba3b914', '1560448204-e02f11c3d0e2', '1605276374104-dee2a0ed3cd6'].map(img),
      specs: { Possession: 'Ready to move', Facing: 'North', Parking: '3 covered' }, status: 'sold', is_public: false,
    }, 1200),
    prop('nalsarovar-weekend-villa', {
      title: 'Lakeside Weekend Villa, Nalsarovar', project: 'Nal Retreats', config: '3 BHK Weekend Villa', area_sqft: 3200, price: 2.9 * CR, locality: 'Nalsarovar',
      segment: 'residential', category: 'weekend_villa',
      description: 'A low-slung farm villa twenty minutes past Sanand, with a reed-lined pool, outdoor kitchen and uninterrupted views across the bird sanctuary wetlands.',
      amenities: [amenities[0], amenities[4], amenities[6], amenities[8], amenities[9]], images: ['1600047509358-9dc75507daeb', '1570129477492-45c003edd2be', '1572120360610-d971b9d7767c'].map(img),
      specs: { Possession: 'Ready to move', Plot: '2 acres', Facing: 'North-West', Parking: '4 cars', Furnishing: 'Fully furnished' }, status: 'available', is_public: true,
    }, 240),
    prop('sanand-weekend-plot', {
      title: 'Riverfront Weekend Plots, Sanand', project: 'Aranya Farms', config: 'NA farm plot', area_sqft: 21780, price: 1.1 * CR, locality: 'Sanand',
      segment: 'residential', category: 'weekend_plot',
      description: 'Half-acre titled farm plots on the Sanand–Viramgam stretch, gated and fenced, with internal roads, drip lines and power already laid in.',
      amenities: [amenities[4], amenities[6], amenities[9]], images: ['1500382017468-9049fed747ef', '1464278533981-50106e6176b1'].map(img),
      specs: { Possession: 'Immediate', Plot: '0.5 acre', Title: 'NA, clear', Approach: '24 ft internal road' }, status: 'available', is_public: true,
    }, 150),
    prop('sbr-corporate-house', {
      title: 'Corporate House, Sindhu Bhavan Road', project: 'Westgate Business Bay', config: 'Office floor', area_sqft: 4800, price: 7.4 * CR, locality: 'Sindhu Bhavan Road',
      segment: 'commercial', category: 'apartment',
      description: 'A full fitted-out floor with 60 workstations, four cabins and a boardroom, on the corner of Sindhu Bhavan Road with dedicated visitor parking.',
      amenities: [amenities[2], amenities[4], amenities[5], amenities[7], amenities[9]], images: ['1497366754035-f200968a6e72', '1497366811353-6870744d04b2', '1524758631624-e2822e304c36'].map(img),
      specs: { Possession: 'Ready to move', Floor: '7th', Parking: '12 reserved', Furnishing: 'Fully fitted' }, status: 'available', is_public: true,
    }, 320),
    prop('sp-ring-commercial-plot', {
      title: 'Highway Commercial Plot, SP Ring Road', project: 'Independent', config: 'Commercial plot', area_sqft: 10890, price: 4.2 * CR, locality: 'SP Ring Road',
      segment: 'commercial', category: 'plot',
      description: 'Quarter-acre corner plot with 110 ft of frontage on the SP Ring Road service lane, zoned for retail or a showroom block.',
      amenities: [amenities[4], amenities[9]], images: ['1486406146926-c627a92ad1ab', '1503387762-592deb58ef4e'].map(img),
      specs: { Possession: 'Immediate', Frontage: '110 ft', Zoning: 'Commercial', Title: 'Clear' }, status: 'available', is_public: false,
    }, 90),
  ]

  // name, phone, source, stage, property index | interest, budget (Cr), hours ago, extras
  const rows: [string, string, LeadSource, StageKey, number | string, [number, number], number, LeadExtra?][] = [
    ['Rohan Mehta', '+919876543210', '99acres', 'new', 0, [6, 7], 3, { also: [1] }],
    ['Priya Shah', '+919821012345', 'website', 'visit', 1, [4, 5], 50],
    ['Vikram Singh', '+919537677889', '99acres', 'udnb', 2, [8, 10], 120, { also: [5], notes: 'Wants possession before Diwali. Father-in-law is the decision maker — loop him into the next visit.' }],
    ['Sneha Joshi', '+919000123456', 'referral', 'lost', 3, [2.5, 3], 480, { referral: 'Kavya Shah (past client)' }],
    ['Amit Desai', '+919312345678', '99acres', 'visit', '4 BHK in Bodakdev', [3, 4], 75],
    ['Neha Patel', '+919898765432', 'social_media', 'new', 1, [4, 5], 20, { notes: 'Came in from the Instagram reel on the Ambli penthouse. Prefers WhatsApp-free follow-up, call after 7pm.' }],
    ['Karan Thakkar', '+919724455667', 'property_page', 'meeting', 0, [6, 7], 170, { also: [2, 5] }],
    ['Isha Trivedi', '+919925511223', '99acres', 'won', 5, [5, 5.5], 720],
    ['Rahul Agarwal', '+14155550142', 'website', 'visit', 2, [8, 9.5], 96, { notes: 'NRI, in Ahmedabad for two weeks in December. Schedule everything inside that window.' }],
    ['Pooja Sharma', '+919811122334', '99acres', 'new', '3 BHK duplex, Prahlad Nagar', [2, 2.5], 1],
    ['Harsh Vora', '+919426677889', 'walk_in', 'meeting', 3, [3.5, 4], 216, { notes: 'Asked for a 40:60 payment plan. Owner approval pending.' }],
    ['Anjali Mehta', '+919099887766', '99acres', 'lost', 4, [2, 2.4], 360],
    ['Devansh Parikh', '+919737373737', 'referral', 'won', 3, [3.5, 3.8], 600, { referral: 'Rotary Club Ahmedabad West' }],
    ['Ritu Kapoor', '+447700900123', 'website', 'new', 0, [6, 7], 6],
    ['Sahil Khan', '+919512345670', '99acres', 'udnb', '5 BHK bungalow, Thaltej', [8, 10], 140],
    ['Kunal Shah', '+919879001122', 'social_media', 'udnb', 1, [4.5, 5], 240],
    ['Tanvi Desai', '+919601234567', 'property_page', 'new', 2, [9, 10], 26],
    ['Manish Jain', '+919825567890', '99acres', 'visit', 0, [6, 6.5], 44],
    ['Jigar Bhavsar', '+919825334455', 'referral', 'future', 8, [7, 8], 300, { referral: 'Studio Aangan Interiors', notes: 'Expanding the office in the next financial year, not before April. Keep warm, quarterly check-in.' }],
    ['Falguni Raval', '+919824998877', 'social_media', 'future', 6, [2.5, 3], 410, { also: [7], notes: 'Weekend home hunt is on hold until the Sanand plot title is through. Revisit after monsoon.' }],
  ]

  const t: Tables = {
    profiles, properties, contacts: [], leads: [], lead_activities: [], tasks: [], tickets: [], documents: [], goals: [],
    pipelines: [{ id: PL, name: 'Sales pipeline', position: 0, created_at: at(-2000) }],
    stages: STAGE_DEFS.map(([key, label, tone, kind], i) => ({ id: S(key), pipeline_id: PL, label, tone, position: i, kind })),
  }
  let n = 0
  const act = (lead_id: string, type: Tables['lead_activities'][number]['type'], body: string, actor_id: string | null, created_at: string, meta = {}) =>
    t.lead_activities.push({ id: `a-${++n}`, lead_id, type, body, actor_id, created_at, meta })

  rows.forEach(([cname, phone, source, status, interest, [bmin, bmax], age, extra = {}], i) => {
    const created = at(-age)
    const property = typeof interest === 'number' ? properties[interest] : null
    const ids = [property?.id, ...(extra.also ?? []).map(k => properties[k].id)].filter((v): v is string => !!v)
    t.contacts.push({ id: `c-${i}`, name: cname, phone, email: `${cname.split(' ')[0].toLowerCase()}@example.com`, kind: status === 'won' ? 'client' : 'lead', created_by: null, created_at: created })
    const lead: Lead = {
      id: `l-${i}`, contact_id: `c-${i}`, source, pipeline_id: PL, status: S(status), property_ids: ids,
      property_interest: property ? `${property.config}, ${property.locality}` : (interest as string),
      budget_min: bmin * CR, budget_max: bmax * CR, city: phone.startsWith('+91') ? 'Ahmedabad' : 'Overseas (NRI)',
      assigned_to: OWNER, external_ref: source === '99acres' ? `99A-${48210 + i}` : null,
      referral_detail: extra.referral ?? null, notes: extra.notes ?? '',
      lost_reason: status === 'lost' ? (i % 2 ? 'Bought elsewhere' : 'Budget mismatch') : null, created_at: created, updated_at: created,
    }
    t.leads.push(lead)
    // Portal and website enquiries arrive through a webhook, so they have no human actor.
    const system = ['99acres', 'property_page', 'social_media'].includes(source)
    act(lead.id, 'created', `Lead captured from ${SOURCE_LABEL[source]}`, system ? null : OWNER, created)
    if (source === 'social_media') act(lead.id, 'enquiry', 'Direct message: "Hi, saw your reel — is this still available? Please share the brochure."', null, created)

    const PATH: Record<StageKey, StageKey[]> = {
      new: [], visit: ['visit'], udnb: ['visit', 'udnb'], meeting: ['visit', 'udnb', 'meeting'], future: ['future'],
      won: ['visit', 'udnb', 'meeting', 'won'], lost: ['visit', 'lost'],
    }
    const path = PATH[status]
    let prev: StageKey = 'new'
    path.forEach((s, k) => {
      const when = at(-age + (age * (k + 1)) / (path.length + 1))
      if (s === 'visit') act(lead.id, 'call', 'Call — discussed requirements and emailed the brochure', OWNER, when, { minutes: 6 })
      if (s === 'udnb') act(lead.id, 'note', 'Budget confirmed, wants a site visit with family this weekend', OWNER, when)
      if (s === 'meeting') act(lead.id, 'note', 'Site visit done — bringing the family in for a closing meeting', OWNER, when)
      if (s === 'future') act(lead.id, 'note', 'Parked as a future lead — timing is the only blocker, not budget', OWNER, when)
      act(lead.id, 'status_change', `Stage changed from ${LABEL(prev)} to ${LABEL(s)}${s === 'lost' ? ` — ${lead.lost_reason}` : ''}`, OWNER, when)
      prev = s
    })

    if (status !== 'won' && status !== 'lost' && status !== 'future') {
      const due = [-20, 2, 26, 50][i % 4]
      t.tasks.push({ id: `t-${i}`, title: `Follow up with ${cname}`, kind: 'call', lead_id: lead.id, property_id: ids[0] ?? null, assigned_to: OWNER, due_at: slot(due), ends_at: null, status: 'pending', created_by: OWNER, created_at: created })
      if (status === 'udnb' || status === 'meeting') t.tasks.push({ id: `t-v${i}`, title: `Site visit — ${property?.title ?? lead.property_interest}`, kind: 'site_visit', lead_id: lead.id, property_id: ids[0] ?? null, assigned_to: OWNER, due_at: slot(24 + i * 6), ends_at: slot(24 + i * 6, 1), status: 'pending', created_by: OWNER, created_at: created })
    }
  })

  t.contacts.push(
    { id: 'c-v1', name: 'Studio Aangan Interiors', phone: '+919824011223', email: 'hello@aangan.example.com', kind: 'vendor', created_by: OWNER, created_at: at(-2000) },
    { id: 'c-v2', name: 'Adv. Jignesh Bhatt (Title & Legal)', phone: '+919825044556', email: 'jbhatt@example.com', kind: 'vendor', created_by: OWNER, created_at: at(-1500) },
    { id: 'c-v3', name: 'Rakesh Modi (Home Loans DSA)', phone: '+919727088990', email: null, kind: 'vendor', created_by: OWNER, created_at: at(-900) },
  )

  const task = (id: string, title: string, kind: Tables['tasks'][number]['kind'], from: number, hours: number | null, extra: Partial<Tables['tasks'][number]> = {}) =>
    t.tasks.push({ id, title, kind, assigned_to: OWNER, due_at: slot(from), ends_at: hours ? slot(from, hours) : null, status: 'pending', lead_id: null, property_id: null, created_by: OWNER, created_at: at(-48), ...extra })
  task('t-m1', 'Weekly pipeline review', 'meeting', 20, 1)
  task('t-m2', 'Developer meeting — Aurelia pricing', 'meeting', 52, 1.5, { property_id: properties[0].id })
  task('t-m3', 'Photo shoot — Prahlad Nagar Duplex', 'other', 74, 2, { property_id: properties[4].id })
  task('t-d1', 'Collect KYC from Isha Trivedi', 'documents', -200, null, { lead_id: 'l-7', status: 'done' })
  task('t-d2', 'Sign off — Signature Residence payment plan', 'approval', 6, null, { lead_id: 'l-10', property_id: properties[3].id })
  task('t-v0', 'Site visit — Science City Villa', 'site_visit', -400, 1, { lead_id: 'l-7', property_id: properties[5].id, status: 'done' })
  task('t-t1', 'Text the Sanand plot title update to Falguni', 'text', 8, null, { lead_id: 'l-19' })

  const goal = (period: GoalPeriod, metric: GoalMetric, target: number): Goal =>
    ({ id: `g-${period}-${metric}`, period, metric, target, created_at: at(-1000), updated_at: at(-1000) })
  t.goals = [
    goal('weekly', 'leads', 8),
    goal('weekly', 'site_visits', 3),
    goal('monthly', 'leads', 30),
    goal('monthly', 'won', 3),
    goal('monthly', 'revenue', 12 * CR),
    goal('monthly', 'site_visits', 12),
    goal('yearly', 'won', 30),
    goal('yearly', 'revenue', 120 * CR),
  ]

  const doc = (id: string, name: string, folder: Tables['documents'][number]['folder'], kb: number, age: number, link: { lead?: string; property?: string }) =>
    t.documents.push({ id, name, folder, size: kb * 1024, mime: 'application/pdf', storage_path: '', lead_id: link.lead ?? null, property_id: link.property ?? null, uploaded_by: OWNER, created_at: at(-age) })
  doc('d-1', 'Aurelia — Floor plans (14th & 15th).pdf', 'Property', 2400, 800, { property: properties[0].id })
  doc('d-2', 'Aurelia Residences — Brochure.pdf', 'Property', 5800, 850, { property: properties[0].id })
  doc('d-3', 'Ambli Crest — Price list Q4.pdf', 'Property', 310, 300, { property: properties[1].id })
  doc('d-4', 'Sale Agreement — Isha Trivedi.pdf', 'Agreements', 1200, 300, { lead: 'l-7', property: properties[5].id })
  doc('d-5', 'KYC — Isha Trivedi (PAN, Aadhaar).pdf', 'KYC', 900, 400, { lead: 'l-7' })
  doc('d-6', 'Booking receipt — ₹25 L.pdf', 'Payments', 150, 320, { lead: 'l-7' })
  doc('d-7', 'Allotment letter — Devansh Parikh.pdf', 'Agreements', 450, 200, { lead: 'l-12', property: properties[3].id })
  doc('d-8', 'Title search report — Thaltej plot.pdf', 'Property', 3100, 450, { property: properties[2].id })
  doc('d-9', 'Aranya Farms — NA title certificate.pdf', 'Property', 780, 120, { property: properties[7].id })

  const ticket = (number: number, title: string, description: string, priority: TicketPriority, status: TicketStatus, age: number, link: { lead?: number; property?: number } = {}): Ticket => {
    const created = at(-age)
    return {
      id: `tk-${number}`, number, title, description, priority, status, raised_by: OWNER, assigned_to: OWNER, created_at: created,
      lead_id: link.lead != null ? `l-${link.lead}` : null, property_id: link.property != null ? properties[link.property].id : null,
      sla_due_at: slaDue(created, priority), escalation_level: 0, escalated_at: null,
      in_progress_at: status !== 'pending' ? at(-age + 1) : null, resolved_at: status === 'resolved' ? at(-age + 20) : null,
    }
  }
  t.tickets = [
    ticket(1, 'Duplicate contact for Amit Desai', 'Amit shows twice in contacts with different number formats.', 'low', 'resolved', 96, { lead: 4 }),
    ticket(2, 'Property images not loading on share link', 'Client says the Sky Villa link shows blank images on his phone.', 'normal', 'pending', 60, { property: 0 }),
    ticket(3, 'Update floor plan PDF for Aurelia', 'Developer shared revised floor plans for the 15th floor.', 'normal', 'in_progress', 20, { property: 0 }),
    ticket(4, '99acres SMS not forwarding', 'No 99acres leads captured since yesterday evening — check the forwarder app.', 'high', 'in_progress', 10),
    ticket(5, 'Client wants revised payment schedule', 'Harsh Vora asked for a 40:60 payment plan on the Signature Residence.', 'urgent', 'pending', 2, { lead: 10, property: 3 }),
  ]
  return t
}
