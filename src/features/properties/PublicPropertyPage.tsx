import { useState, type FormEvent, type ReactNode } from 'react'
import { useParams } from 'react-router'
import { BedDouble, Check, CheckCircle2, ChevronLeft, ChevronRight, MapPin, Ruler } from 'lucide-react'
import { Button, Card, ErrorText, Field, inputCls, Loading } from '../../components/ui'
import { Brand } from '../../components/Layout'
import { PROPERTY_STATUS_LABEL } from '../../lib/labels'
import { inr } from '../../lib/format'
import type { Property } from '../../lib/types'
import { usePublicProperty, useSubmitEnquiry } from './api'

export function PublicPropertyPage() {
  const { slug = '' } = useParams()
  const { data, isLoading } = usePublicProperty(slug)
  return (
    <div className="min-h-dvh bg-white">
      <header className="border-b border-slate-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Brand />
          <a href="#enquire" className="rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy-2">Enquire</a>
        </div>
      </header>
      {isLoading ? <Loading /> : data ? <Listing p={data} /> : (
        <div className="mx-auto max-w-md px-6 py-32 text-center">
          <h1 className="text-xl font-bold text-slate-900">This property isn't available</h1>
          <p className="mt-2 text-slate-500">The link may have expired or the listing was taken down. Contact your Luxerefy advisor for current options.</p>
        </div>
      )}
      <footer className="mt-16 border-t border-slate-100 py-8 text-center text-xs text-slate-400">© Luxerefy · Ahmedabad's Luxury Real Estate Advisory</footer>
    </div>
  )
}

function Listing({ p }: { p: Property }) {
  const [i, setI] = useState(0)
  const n = p.images.length
  const go = (d: number) => setI(x => (x + d + n) % n)

  return (
    <main className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
      {n > 0 && (
        <section aria-label="Gallery">
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-slate-100 sm:aspect-[16/8]">
            <img src={p.images[i]} alt={`${p.title} — photo ${i + 1} of ${n}`} className="size-full object-cover" />
            {n > 1 && <>
              <button type="button" onClick={() => go(-1)} aria-label="Previous photo" className="absolute top-1/2 left-3 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow hover:bg-white"><ChevronLeft className="size-5" /></button>
              <button type="button" onClick={() => go(1)} aria-label="Next photo" className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow hover:bg-white"><ChevronRight className="size-5" /></button>
            </>}
            <span className="absolute right-3 bottom-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white">{i + 1} / {n}</span>
          </div>
          {n > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {p.images.map((src, k) => (
                <button key={src + k} type="button" onClick={() => setI(k)} aria-label={`Show photo ${k + 1}`} className={`shrink-0 overflow-hidden rounded-lg ring-2 transition ${k === i ? 'ring-blue-600' : 'ring-transparent opacity-70 hover:opacity-100'}`}>
                  <img src={src} alt="" className="h-16 w-24 object-cover sm:h-20 sm:w-32" />
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="mt-8 grid gap-10 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <p className="text-sm font-semibold tracking-wide text-blue-700 uppercase">{p.project}</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">{p.title}</h1>
          <p className="mt-2 flex items-center gap-1.5 text-slate-500"><MapPin className="size-4" /> {p.locality}, {p.city}</p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span className="text-3xl font-extrabold text-navy">{inr(p.price)}</span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">{PROPERTY_STATUS_LABEL[p.status]}</span>
          </div>
          <div className="mt-6 flex flex-wrap gap-3 text-sm font-semibold text-slate-700">
            <span className="inline-flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-2.5 ring-1 ring-slate-200"><BedDouble className="size-4 text-blue-700" /> {p.config}</span>
            <span className="inline-flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-2.5 ring-1 ring-slate-200"><Ruler className="size-4 text-blue-700" /> {p.area_sqft.toLocaleString('en-IN')} sq ft</span>
          </div>

          {p.description && <Section title="Overview"><p className="leading-relaxed whitespace-pre-line text-slate-600">{p.description}</p></Section>}
          {Object.keys(p.specs).length > 0 && (
            <Section title="Specifications">
              <dl className="grid gap-px overflow-hidden rounded-xl bg-slate-200 ring-1 ring-slate-200 sm:grid-cols-2">
                {Object.entries(p.specs).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 bg-white px-4 py-3 text-sm"><dt className="text-slate-500">{k}</dt><dd className="text-right font-semibold text-slate-800">{v}</dd></div>
                ))}
              </dl>
            </Section>
          )}
          {p.amenities.length > 0 && (
            <Section title="Amenities">
              <ul className="grid gap-2.5 sm:grid-cols-2">
                {p.amenities.map(a => <li key={a} className="flex items-center gap-2 text-slate-700"><span className="rounded-full bg-blue-50 p-1 text-blue-700"><Check className="size-3.5" /></span>{a}</li>)}
              </ul>
            </Section>
          )}
        </div>

        <aside id="enquire" className="lg:sticky lg:top-6 lg:self-start">
          <Card className="p-6 shadow-xl shadow-slate-200/60"><EnquiryForm p={p} /></Card>
        </aside>
      </div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="mt-10"><h2 className="mb-4 text-lg font-bold text-slate-900">{title}</h2>{children}</section>
}

function EnquiryForm({ p }: { p: Property }) {
  const enquire = useSubmitEnquiry(p)
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const s = (k: string) => String(f.get(k) ?? '').trim()
    enquire.mutate({ name: s('name'), phone: s('phone'), email: s('email'), message: s('message') })
  }
  if (enquire.isSuccess) return (
    <div className="py-6 text-center">
      <CheckCircle2 className="mx-auto size-10 text-emerald-600" />
      <h2 className="mt-3 text-lg font-bold text-slate-900">Thank you</h2>
      <p className="mt-1 text-sm text-slate-500">A Luxerefy advisor will call you shortly about {p.title}.</p>
    </div>
  )
  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Enquire now</h2>
        <p className="text-sm text-slate-500">Get pricing, floor plans or book a private visit.</p>
      </div>
      <Field label="Name"><input name="name" required autoComplete="name" className={inputCls} /></Field>
      <Field label="Mobile"><input name="phone" required inputMode="tel" autoComplete="tel" className={inputCls} placeholder="+91" /></Field>
      <Field label="Email (optional)"><input name="email" type="email" autoComplete="email" className={inputCls} /></Field>
      <Field label="Message"><textarea name="message" rows={3} className={inputCls} defaultValue={`I'm interested in ${p.title}. Please share more details.`} /></Field>
      <ErrorText error={enquire.error} />
      <Button type="submit" className="w-full" disabled={enquire.isPending}>Request a call back</Button>
    </form>
  )
}
