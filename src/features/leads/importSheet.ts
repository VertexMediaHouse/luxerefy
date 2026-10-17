// Sheet rows -> CaptureInput. Pure and React-free so `npm run check` can run it in Node;
// imports carry .ts for the same reason. The actual .xlsx decoding lives in ImportModal.
import { normalizePhone, type CaptureInput } from '../../lib/rules.ts'
import { SOURCE_LABEL } from '../../lib/labels.ts'
import type { LeadSource } from '../../lib/types.ts'

export type SheetRow = Record<string, unknown>

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Agents name columns whatever they like, so match on a normalised alias then a substring. */
const ALIASES = {
  name: ['name', 'leadname', 'clientname', 'customername', 'fullname', 'contactname', 'customer', 'client'],
  phone: ['phone', 'mobile', 'mobileno', 'mobilenumber', 'phoneno', 'phonenumber', 'contactno', 'contactnumber', 'whatsapp', 'whatsappnumber', 'contact'],
  email: ['email', 'emailid', 'emailaddress', 'mail'],
  city: ['city', 'location', 'town'],
  property_interest: ['propertyinterest', 'interest', 'property', 'project', 'requirement', 'lookingfor', 'enquiryfor', 'configuration', 'config'],
  budget: ['budgetrange', 'budget', 'pricerange', 'price'],
  budget_min: ['budgetmin', 'minbudget', 'budgetfrom', 'pricemin', 'minprice'],
  budget_max: ['budgetmax', 'maxbudget', 'budgetto', 'pricemax', 'maxprice'],
  source: ['leadsource', 'source', 'channel', 'medium', 'via'],
  notes: ['notes', 'note', 'message', 'remarks', 'remark', 'comments', 'comment'],
} as const

export type Field = keyof typeof ALIASES
const FIELDS = Object.keys(ALIASES) as Field[]
const aliases = (f: Field) => ALIASES[f] as readonly string[]

/** The header row mapped onto our fields. First column to claim a field keeps it. */
export function mapHeaders(headers: string[]): Partial<Record<Field, string>> {
  const out: Partial<Record<Field, string>> = {}
  for (const h of headers) {
    const n = norm(h)
    if (!n) continue
    const field = FIELDS.find(f => aliases(f).includes(n)) ?? FIELDS.find(f => aliases(f).some(a => n.includes(a)))
    if (field && !out[field]) out[field] = h
  }
  return out
}

/**
 * "2.5 Cr", "85 L", "2,50,00,000" and bare numbers -> rupees.
 * ponytail: a bare number under 1000 reads as crores, which is how these sheets are written.
 * Add an explicit unit column if someone starts pasting rupee amounts under a thousand.
 */
export function money(v: unknown): number | null {
  const s = String(v ?? '').trim().toLowerCase()
  if (!s) return null
  const n = parseFloat(s.replace(/,/g, '').replace(/[^\d.]/g, ''))
  if (!isFinite(n) || n <= 0) return null
  if (/cr|crore/.test(s)) return Math.round(n * 1e7)
  if (/lakh|lac|l\s*$/.test(s)) return Math.round(n * 1e5)
  return n < 1000 ? Math.round(n * 1e7) : Math.round(n)
}

/** One budget column holding a range: "2 - 3 Cr", "2 to 3 cr", "1.5–2 Cr". */
export function range(v: unknown): [number | null, number | null] {
  const s = String(v ?? '').trim()
  const parts = s.split(/\s*(?:-|–|—|to)\s*/i).filter(Boolean)
  if (parts.length < 2) return [money(s), null]
  const unit = s.match(/crore|cr|lakh|lac|l\s*$/i)?.[0] ?? ''
  return [money(`${parts[0]} ${unit}`), money(`${parts[1]} ${unit}`)]
}

const SOURCES = Object.keys(SOURCE_LABEL) as LeadSource[]

export function source(v: unknown): LeadSource {
  const n = norm(String(v ?? ''))
  if (!n) return 'other'
  for (const s of SOURCES) if (norm(s) === n || norm(SOURCE_LABEL[s]) === n) return s
  for (const s of SOURCES) if (n.includes(norm(s))) return s
  return 'other'
}

export interface Parsed {
  row: number
  name: string
  phone: string
  input: CaptureInput | null
  error: string | null
}

/** Every row comes back, valid or not, so the preview can show what will be skipped and why. */
export function parseRows(rows: SheetRow[], pipeline_id: string): Parsed[] {
  const headers = [...new Set(rows.flatMap(Object.keys))]
  const map = mapHeaders(headers)
  const get = (r: SheetRow, f: Field) => {
    const key = map[f]
    return key === undefined ? '' : String(r[key] ?? '').trim()
  }

  return rows.map((r, i) => {
    const row = i + 2 // sheet row: 1 is the header
    const name = get(r, 'name')
    const raw = get(r, 'phone')
    const phone = normalizePhone(raw)
    if (!raw) return { row, name, phone: raw, input: null, error: 'No phone number' }
    if (!phone) return { row, name, phone: raw, input: null, error: 'Not a valid mobile number' }

    let [min, max] = map.budget ? range(get(r, 'budget')) : [null, null]
    if (map.budget_min) min = money(get(r, 'budget_min'))
    if (map.budget_max) max = money(get(r, 'budget_max'))

    return {
      row, name: name || 'Unknown', phone, error: null,
      input: {
        name: name || 'Unknown', phone, pipeline_id, source: source(get(r, 'source')),
        email: get(r, 'email') || null, city: get(r, 'city') || null,
        property_interest: get(r, 'property_interest') || null,
        budget_min: min, budget_max: max, message: get(r, 'notes') || null,
      },
    }
  })
}
