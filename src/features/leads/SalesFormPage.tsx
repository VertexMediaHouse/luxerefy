import { useState, type FormEvent } from 'react'
import { CheckCircle2, Send } from 'lucide-react'
import { Brand } from '../../components/Layout'
import { Button, Field, inputCls } from '../../components/ui'
import { db, write } from '../../lib/mock/db'
import { captureLead } from '../../lib/rules'

export function SalesFormPage() {
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    const f = new FormData(e.currentTarget)
    const s = (k: string) => String(f.get(k) ?? '').trim()
    try {
      await write(() => captureLead(db, {
        name: s('name'), phone: s('phone'), email: s('email') || null,
        source: 'other', property_interest: s('interest') || null,
        notes: s('notes') || null, referral_detail: 'Sales Team',
      }, null))
      setDone(true)
    } catch (ex) {
      setErr((ex as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (done) return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-card ring-1 ring-slate-200/70">
        <CheckCircle2 className="mx-auto mb-4 size-12 text-emerald-500" />
        <h1 className="text-xl font-semibold text-slate-900">Lead submitted</h1>
        <p className="mt-2 text-sm text-slate-500">Thank you — the details are now in the CRM.</p>
        <Button className="mt-6" onClick={() => { setDone(false) }}>Add another</Button>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-card ring-1 ring-slate-200/70 sm:p-8">
        <div className="mb-6"><Brand /></div>
        <h1 className="text-lg font-semibold text-slate-900">Submit a lead</h1>
        <p className="mb-6 text-sm text-slate-500">Fill in the prospect's details. It goes straight into the pipeline.</p>

        <form onSubmit={submit} className="grid gap-4">
          <Field label="Name *"><input name="name" required className={inputCls} placeholder="Full name" /></Field>
          <Field label="Mobile *"><input name="phone" required className={inputCls} placeholder="+91 98111 22334" /></Field>
          <Field label="Email"><input name="email" type="email" className={inputCls} /></Field>
          <Field label="Interested in"><input name="interest" className={inputCls} placeholder="3 BHK in Prahlad Nagar" /></Field>
          <Field label="Notes"><textarea name="notes" rows={3} className={inputCls} placeholder="Budget, timeline, any details…" /></Field>
          {err && <p className="text-sm font-medium text-red-600">{err}</p>}
          <Button type="submit" disabled={busy}><Send className="size-4" /> Submit lead</Button>
        </form>
      </div>
    </div>
  )
}
