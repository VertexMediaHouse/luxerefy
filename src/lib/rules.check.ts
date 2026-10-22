// Run: npm run check
import assert from 'node:assert/strict'
import { addedByMe, captureLead, entryOf, escalateTickets, findClash, goalProgress, isLost, isOpen, isWon, normalizePhone, overlappingIds, parse99acres, periodRange, slaDue } from './rules.ts'
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
const owner = p('owner', 'owner')
const t: Tables = {
  profiles: [owner], contacts: [], properties: [], leads: [], lead_activities: [], tasks: [], tickets: [], documents: [], goals: [],
  pipelines: [{ id: 'pl-1', name: 'Sales pipeline', position: 0, created_at: '' }], stages: [],
}

// Stage ids are data, but the three reserved kinds derive from the pipeline id, which is what
// lets isOpen stay free of the stages table. A generated custom id must never read as terminal.
assert.equal(entryOf('pl-2'), 'pl-2-new')
assert.ok(isOpen({ status: 'pl-1-new' }) && isOpen({ status: 'pl-1-udnb' }))
assert.ok(isOpen({ status: 'pl-1-future' }), 'future leads are an open stage, not a terminal')
assert.ok(isOpen({ status: 'pl-1-s7-mf3k2' }), 'generated stage ids stay open')
assert.ok(!isOpen({ status: 'pl-1-won' }) && !isOpen({ status: 'pl-2-lost' }))
assert.ok(isWon({ status: 'pl-2-won' }) && !isWon({ status: 'pl-2-lost' }))
assert.ok(isLost({ status: 'pl-9-lost' }) && !isLost({ status: 'pl-9-won' }))

const first = captureLead(t, sms, null)
assert.ok(first.created)
assert.equal(first.lead.assigned_to, 'owner', 'one desk: everything lands on the owner')
assert.equal(first.lead.pipeline_id, 'pl-1', 'new enquiries land on the lowest-position pipeline')
assert.equal(first.lead.status, 'pl-1-new', 'and on that pipeline entry stage')
assert.equal(t.tasks.length, 1, '99acres lead gets an auto follow-up task')
assert.equal(t.tasks[0].kind, 'call')

const again = captureLead(t, { ...sms, phone: '9876543210' }, null)
assert.ok(!again.created, 'same phone, open lead → no duplicate')
assert.equal(t.leads.length, 1)

// A webhook lead has no actor; one typed in by hand does, which is what "added by me" reads.
assert.ok(!addedByMe(t, first.lead.id, 'owner'), 'portal leads are not "added by me"')
const mine = captureLead(t, { name: 'B', phone: '9999988888', source: 'walk_in' }, owner)
assert.ok(addedByMe(t, mine.lead.id, 'owner'))

const multi = captureLead(t, { name: 'C', phone: '9999977777', source: 'referral', property_ids: ['p-1', 'p-2', ''], referral_detail: ' Rotary Club ' }, owner)
assert.deepEqual(multi.lead.property_ids, ['p-1', 'p-2'], 'a lead carries every property it is shown')
assert.equal(multi.lead.referral_detail, 'Rotary Club')
assert.equal(captureLead(t, { name: 'D', phone: '9999966666', source: 'website', referral_detail: 'x' }, owner).lead.referral_detail, null, 'referral detail only applies to referrals')
assert.throws(() => captureLead(t, { name: 'E', phone: '123', source: 'other' }, null))

const created = new Date(Date.now() - 5 * 3600e3).toISOString()
t.tickets.push({
  id: 'tk', number: 1, title: '', description: '', status: 'pending', priority: 'urgent', lead_id: null, property_id: null,
  raised_by: 'owner', assigned_to: null, sla_due_at: slaDue(created, 'urgent'), escalation_level: 0, escalated_at: null,
  in_progress_at: null, resolved_at: null, created_at: created,
})
assert.equal(escalateTickets(t), 1)
assert.equal(t.tickets[0].escalation_level, 1)
assert.equal(t.tickets[0].assigned_to, 'owner', 'escalation parks it on the one desk')
assert.equal(escalateTickets(t), 0, 'idempotent')

const slot = (id: string, from: number, to: number, assigned_to = 'owner') =>
  ({ id, assigned_to, due_at: new Date(Date.UTC(2026, 0, 1, from)).toISOString(), ends_at: new Date(Date.UTC(2026, 0, 1, to)).toISOString(), status: 'pending' as const })
t.tasks = [{ ...slot('v1', 10, 11), title: 'Visit', kind: 'site_visit', lead_id: null, property_id: null, created_by: null, created_at: '' }]
assert.equal(findClash(t, slot('x', 10, 12))?.id, 'v1', 'overlap blocked')
assert.equal(findClash(t, slot('x', 11, 12)), null, 'back-to-back allowed')
assert.equal(findClash(t, slot('x', 10, 11, 'other')), null, 'a different person is free')
assert.equal(findClash(t, { ...slot('x', 10, 11), status: 'cancelled' }), null)

// The calendar flags slots that already overlap, including pairs that pre-date the guard.
assert.deepEqual([...overlappingIds([slot('a', 10, 12), slot('b', 11, 13), slot('c', 14, 15)])].sort(), ['a', 'b'])
assert.equal(overlappingIds([slot('a', 10, 12), { ...slot('b', 11, 13), ends_at: null }]).size, 0, 'untimed entries never clash')

const jan2 = new Date(2026, 0, 2, 15) // a Friday
assert.equal(periodRange('weekly', jan2).start.getDate(), 29, 'the week starts on Monday')
assert.equal(periodRange('monthly', jan2).start.getDate(), 1)
assert.equal(periodRange('yearly', jan2).start.getMonth(), 0)
assert.equal(periodRange('monthly', jan2).end.getMonth(), 1, 'end is exclusive, the 1st of next month')

const now = new Date()
const g: Tables = { ...t, leads: [], tasks: [], goals: [] }
g.leads = [
  { ...first.lead, id: 'w1', status: 'pl-1-won', budget_max: 5e7, created_at: now.toISOString(), updated_at: now.toISOString() },
  { ...first.lead, id: 'o1', status: 'pl-1-new', created_at: now.toISOString(), updated_at: now.toISOString() },
]
assert.equal(goalProgress(g, { period: 'monthly', metric: 'leads' }, now), 2)
assert.equal(goalProgress(g, { period: 'monthly', metric: 'won' }, now), 1)
assert.equal(goalProgress(g, { period: 'monthly', metric: 'revenue' }, now), 5e7, 'revenue counts the won budget')
assert.equal(goalProgress(g, { period: 'monthly', metric: 'site_visits' }, now), 0)
g.tasks = [{ ...slot('sv', 10, 11), title: 'v', kind: 'site_visit', lead_id: null, property_id: null, created_by: null, created_at: '', due_at: now.toISOString(), status: 'done' }]
assert.equal(goalProgress(g, { period: 'monthly', metric: 'site_visits' }, now), 1, 'only completed visits count')

console.log('rules ok')
