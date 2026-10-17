// Run: npm run check
import assert from 'node:assert/strict'
import { captureLead, entryOf, escalateTickets, findClash, isLost, isOpen, isWon, normalizePhone, parse99acres, parseWhatsApp, receiveWhatsApp, slaDue } from './rules.ts'
import type { Profile, Tables } from './types.ts'

assert.equal(normalizePhone('098765 43210'), '+919876543210')
assert.equal(normalizePhone('+91-98765-43210'), '+919876543210')
assert.equal(normalizePhone('+44 7700 900123'), '+447700900123')
assert.equal(normalizePhone('12345'), null)

const sms = parse99acres("99acres: Name: Rohan Mehta, Mob: +91 98765 43210. I'm interested in your 4 BHK Sky Villa at Shela.")!
assert.equal(sms.name, 'Rohan Mehta')
assert.equal(sms.phone, '+91 98765 43210')
assert.equal(sms.property_interest, '4 BHK Sky Villa at Shela')
assert.equal(parse99acres({ Name: 'A', Mobile: '9876543210', lead_id: 'Q1' })?.external_ref, 'Q1')
assert.equal(parse99acres('no number here'), null)

const p = (id: string, role: Profile['role']): Profile => ({ id, role, full_name: id, email: '', phone: '', active: true })
const owner = p('owner', 'owner'), a1 = p('a1', 'agent'), a2 = p('a2', 'agent')
const t: Tables = {
  profiles: [owner, a1, a2], contacts: [], properties: [], leads: [], lead_activities: [], tasks: [], tickets: [], documents: [],
  pipelines: [{ id: 'pl-1', name: 'Sales pipeline', position: 0, created_at: '' }], stages: [],
}

// Stage ids are data, but the three reserved kinds derive from the pipeline id, which is what
// lets isOpen stay free of the stages table. A generated custom id must never read as terminal.
assert.equal(entryOf('pl-2'), 'pl-2-new')
assert.ok(isOpen({ status: 'pl-1-new' }) && isOpen({ status: 'pl-1-udnb' }))
assert.ok(isOpen({ status: 'pl-1-s7-mf3k2' }), 'generated stage ids stay open')
assert.ok(!isOpen({ status: 'pl-1-won' }) && !isOpen({ status: 'pl-2-lost' }))
assert.ok(isWon({ status: 'pl-2-won' }) && !isWon({ status: 'pl-2-lost' }))
assert.ok(isLost({ status: 'pl-9-lost' }) && !isLost({ status: 'pl-9-won' }))

const first = captureLead(t, sms, null)
assert.ok(first.created)
assert.equal(first.lead.assigned_to, 'a1')
assert.equal(first.lead.pipeline_id, 'pl-1', 'new enquiries land on the lowest-position pipeline')
assert.equal(first.lead.status, 'pl-1-new', 'and on that pipeline entry stage')
assert.equal(t.tasks.length, 1, '99acres lead gets an auto follow-up task')

const again = captureLead(t, { ...sms, phone: '9876543210' }, null)
assert.ok(!again.created, 'same phone, open lead → no duplicate')
assert.equal(t.leads.length, 1)

assert.equal(captureLead(t, { name: 'B', phone: '9999988888', source: 'website' }, null).lead.assigned_to, 'a2', 'fewest open leads wins')
assert.equal(captureLead(t, { name: 'C', phone: '9999977777', source: 'walk_in', assign_to: 'a2' }, a1).lead.assigned_to, 'a1', 'agents cannot assign to others')
assert.throws(() => captureLead(t, { name: 'D', phone: '123', source: 'other' }, null))

const created = new Date(Date.now() - 5 * 3600e3).toISOString()
t.tickets.push({
  id: 'tk', number: 1, title: '', description: '', status: 'pending', priority: 'urgent', lead_id: null, property_id: null,
  raised_by: 'a1', assigned_to: 'a1', sla_due_at: slaDue(created, 'urgent'), escalation_level: 0, escalated_at: null,
  in_progress_at: null, resolved_at: null, created_at: created,
})
assert.equal(escalateTickets(t), 1)
assert.equal(t.tickets[0].escalation_level, 1)
assert.equal(t.tickets[0].assigned_to, 'owner', 'no manager → owner')
assert.equal(escalateTickets(t), 0, 'idempotent')

const slot = (id: string, from: number, to: number, assigned_to = 'a1') =>
  ({ id, assigned_to, due_at: new Date(Date.UTC(2026, 0, 1, from)).toISOString(), ends_at: new Date(Date.UTC(2026, 0, 1, to)).toISOString(), status: 'pending' as const })
t.tasks = [{ ...slot('v1', 10, 11), title: 'Visit', kind: 'site_visit', lead_id: null, property_id: null, created_by: null, created_at: '' }]
assert.equal(findClash(t, slot('x', 10, 12))?.id, 'v1', 'overlap blocked')
assert.equal(findClash(t, slot('x', 11, 12)), null, 'back-to-back allowed')
assert.equal(findClash(t, slot('x', 10, 11, 'a2')), null, 'other agent allowed')
assert.equal(findClash(t, { ...slot('x', 10, 11), status: 'cancelled' }), null)

const wa = parseWhatsApp({ entry: [{ changes: [{ value: {
  contacts: [{ wa_id: '919812345678', profile: { name: 'Aarav Shah' } }],
  messages: [{ id: 'wamid.1', from: '919812345678', type: 'text', text: { body: 'Is the penthouse available?' } }],
} }] }] })
assert.deepEqual(wa, [{ wa_id: 'wamid.1', phone: '+919812345678', text: 'Is the penthouse available?', name: 'Aarav Shah' }])
const leadsBefore = t.leads.length
const r1 = receiveWhatsApp(t, wa[0])
assert.ok(!r1.duplicate && r1.created && r1.lead.source === 'whatsapp')
assert.ok(receiveWhatsApp(t, wa[0]).duplicate, 'same wa_id ignored')
const r2 = receiveWhatsApp(t, { ...wa[0], wa_id: 'wamid.2' })
assert.ok(!r2.duplicate && !r2.created, 'follow-up message joins the open lead')
assert.equal(t.leads.length, leadsBefore + 1)

console.log('rules ok')
