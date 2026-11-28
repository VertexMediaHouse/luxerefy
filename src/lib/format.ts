export function inr(n: number) {
  if (n >= 1e7) return `₹${+(n / 1e7).toFixed(2)} Cr`
  if (n >= 1e5) return `₹${+(n / 1e5).toFixed(2)} L`
  return `₹${n.toLocaleString('en-IN')}`
}

export function budget(min: number | null, max: number | null) {
  if (min && max) return min === max ? inr(min) : `${inr(min)} – ${inr(max)}`
  if (min) return `${inr(min)}+`
  if (max) return `Up to ${inr(max)}`
  return '—'
}

export const dateTime = (iso: string) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
export function relative(iso: string) {
  const sec = (Date.parse(iso) - Date.now()) / 1000
  for (const [unit, s] of [['day', 86400], ['hour', 3600], ['minute', 60]] as const)
    if (Math.abs(sec) >= s) return rtf.format(Math.round(sec / s), unit)
  return 'just now'
}

/** 3h 20m / 2d 4h */
export function duration(ms: number) {
  const m = Math.round(Math.abs(ms) / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60)
  return d ? `${d}d ${h}h` : h ? `${h}h ${m % 60}m` : `${m}m`
}

export const initials = (name: string) => name.trim().split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase()
export const prettyPhone = (p: string) => (p.startsWith('+91') && p.length === 13 ? `+91 ${p.slice(3, 8)} ${p.slice(8)}` : p)
/** WhatsApp chat link; phones are stored as +91XXXXXXXXXX. */
export const waLink = (p: string) => `https://wa.me/${p.replace(/\D/g, '')}`
export const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** Value for <input type="datetime-local"> in local time. */
export const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)

export const fileSize = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

/** A property's asking price; 0 means none was entered. */
export const askingPrice = (n: number) => (n > 0 ? inr(n) : 'Price on request')

/** "Bopal · 3 BHK · 1,800 sq ft", skipping whatever is blank. */
export const propertyFacts = (p: { locality: string; config: string; area_sqft: number }) =>
  [p.locality, p.config, p.area_sqft > 0 && `${p.area_sqft.toLocaleString('en-IN')} sq ft`].filter(Boolean).join(' · ')
