// Run: npm run check
import assert from 'node:assert/strict'
import { mapHeaders, money, parseRows, range, source } from './importSheet.ts'

// headers: exact alias wins over substring, so "Budget Min" is not read as plain "Budget"
assert.deepEqual(mapHeaders(['Client Name', 'Mobile No.', 'Budget Min', 'Budget Max', 'Lead Source']), {
  name: 'Client Name', phone: 'Mobile No.', budget_min: 'Budget Min', budget_max: 'Budget Max', source: 'Lead Source',
})
assert.equal(mapHeaders(['Budget (Cr)']).budget, 'Budget (Cr)')
assert.equal(mapHeaders(['Phone', 'Mobile']).phone, 'Phone', 'first column to claim a field keeps it')
assert.deepEqual(mapHeaders(['Unrelated', '']), {})

assert.equal(money('2.5 Cr'), 25000000)
assert.equal(money('85 L'), 8500000)
assert.equal(money('2,50,00,000'), 25000000)
assert.equal(money('25000000'), 25000000)
assert.equal(money('2.5'), 25000000, 'a bare number under 1000 is crores')
assert.equal(money(''), null)
assert.equal(money('n/a'), null)

assert.deepEqual(range('2 - 3 Cr'), [20000000, 30000000], 'the unit carries to both ends')
assert.deepEqual(range('1.5–2 Cr'), [15000000, 20000000])
assert.deepEqual(range('80 to 95 L'), [8000000, 9500000])
assert.deepEqual(range('3 Cr'), [30000000, null])

assert.equal(source('99acres'), '99acres')
assert.equal(source('Social media'), 'social_media')
assert.equal(source('WhatsApp'), 'other', 'WhatsApp is no longer a channel we track')
assert.equal(source('Walk-in'), 'walk_in')
assert.equal(source('Property page'), 'property_page')
assert.equal(source('Magicbricks'), 'other', 'an unknown channel is not guessed')
assert.equal(source(''), 'other')

const parsed = parseRows([
  { Name: 'Rohan Mehta', Mobile: '098765 43210', Budget: '6 - 7 Cr', Source: 'Website', City: 'Ahmedabad' },
  { Name: 'No Phone', Mobile: '', Budget: '2 Cr' },
  { Name: 'Bad Phone', Mobile: '12345', Budget: '2 Cr' },
], 'pl-1')

assert.equal(parsed.length, 3, 'invalid rows are returned too, so the preview can explain them')
assert.equal(parsed[0].row, 2, 'row 1 is the header')
assert.equal(parsed[0].input?.phone, '+919876543210')
assert.equal(parsed[0].input?.pipeline_id, 'pl-1')
assert.deepEqual([parsed[0].input?.budget_min, parsed[0].input?.budget_max], [60000000, 70000000])
assert.equal(parsed[1].error, 'No phone number')
assert.equal(parsed[2].error, 'Not a valid mobile number')
assert.ok(!parsed[1].input && !parsed[2].input)

console.log('importSheet ok')
