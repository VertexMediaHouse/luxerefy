import { useState } from 'react'
import { Link } from 'react-router'
import { CheckCircle2, Info } from 'lucide-react'
import { Badge, Button, ErrorText, inputCls, Modal } from '../../components/ui'
import { useUser } from '../../lib/session'
import { canSeeLead } from '../../lib/rules'
import { prettyPhone } from '../../lib/format'
import { fillTemplate, useSendTemplate, useSimulateWhatsApp, WA_TEMPLATES } from './api'

type Recipient = { leadId: string; name: string; phone: string; about: string }

export function SendTemplateModal({ open, onClose, to }: { open: boolean; onClose: () => void; to: Recipient }) {
  return <Modal open={open} onClose={onClose} title="Send WhatsApp template" wide><SendTemplate to={to} onDone={onClose} /></Modal>
}

function SendTemplate({ to, onDone }: { to: Recipient; onDone: () => void }) {
  const [name, setName] = useState<string>(WA_TEMPLATES[0].name)
  const send = useSendTemplate(to.leadId)
  const tpl = WA_TEMPLATES.find(t => t.name === name)!
  const body = fillTemplate(tpl.body, [to.name.split(' ')[0], to.about])

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-xs font-semibold text-slate-600">Approved templates</legend>
        {WA_TEMPLATES.map(t => (
          <label key={t.name} className={`flex cursor-pointer items-start gap-3 rounded-xl p-3 ring-1 transition ${name === t.name ? 'bg-blue-50 ring-blue-600' : 'ring-slate-200 hover:bg-slate-50'}`}>
            <input type="radio" name="template" value={t.name} checked={name === t.name} onChange={() => setName(t.name)} className="mt-1 accent-blue-600" />
            <span>
              <span className="block text-sm font-semibold text-slate-900">{t.label}</span>
              <span className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500"><span className="font-mono">{t.name}</span> <Badge>{t.category}</Badge></span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col">
        <p className="mb-2 text-xs font-semibold text-slate-600">To {to.name} · {prettyPhone(to.phone)}</p>
        <div className="flex-1 rounded-xl bg-[#efeae2] p-4">
          <div className="ml-auto max-w-[90%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-2 text-sm text-slate-800 shadow-sm">{body}</div>
        </div>
        <p className="mt-2 text-xs text-slate-500">Sent through the official WhatsApp Business API. Replies arrive in the WhatsApp dashboard and are logged on this lead.</p>
      </div>
      <div className="flex items-center justify-end gap-3 sm:col-span-2">
        <ErrorText error={send.error} />
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button onClick={() => send.mutate({ template: tpl.name, body }, { onSuccess: onDone })} disabled={send.isPending}>Send</Button>
      </div>
    </div>
  )
}

const metaPayload = (phone: string, name: string, text: string) =>
  JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ field: 'messages', value: {
      contacts: [{ wa_id: phone, profile: { name } }],
      messages: [{ id: `wamid.${Math.random().toString(36).slice(2, 12)}`, from: phone, type: 'text', text: { body: text } }],
    } }] }],
  }, null, 2)
const newNumber = () => metaPayload(`919${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`, 'Ishaan Kothari', 'Hello, saw your Ambli penthouse listing. Is it still available?')
const existingLead = () => metaPayload('919821012345', 'Priya Shah', 'Can we do the visit on Saturday at 11?')

/** Body of the "WhatsApp" tab in the webhook simulator. */
export function SimulateWhatsApp({ onClose }: { onClose: () => void }) {
  const user = useUser()
  const [text, setText] = useState(newNumber)
  const sim = useSimulateWhatsApp()
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Meta posts incoming messages to <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">POST /functions/v1/whatsapp-webhook</code>. A known number with an open lead gets the message on its timeline; a new number becomes a WhatsApp lead. Re-sent message IDs are ignored.
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" className="py-1 text-xs" onClick={() => { setText(newNumber()); sim.reset() }}>New number</Button>
        <Button variant="secondary" className="py-1 text-xs" onClick={() => { setText(existingLead()); sim.reset() }}>Existing lead (Priya Shah)</Button>
      </div>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={9} className={`${inputCls} font-mono text-xs`} aria-label="Webhook payload" />
      <ErrorText error={sim.error} />
      {sim.data?.map((r, i) => (
        <div key={i} className={`flex gap-3 rounded-xl p-4 text-sm ring-1 ${r.duplicate ? 'bg-amber-50 text-amber-900 ring-amber-600/20' : 'bg-emerald-50 text-emerald-900 ring-emerald-600/20'}`}>
          {r.duplicate ? <Info className="size-5 shrink-0" /> : <CheckCircle2 className="size-5 shrink-0" />}
          <div>
            {r.duplicate ? <p><b>Already processed</b>: this message ID was received before, so it was ignored.</p>
              : <p>{r.created ? <><b>New WhatsApp lead</b> for {r.name}, assigned to <b>{r.agent}</b>.</> : <>Message added to <b>{r.name}</b>'s open lead (assigned to <b>{r.agent}</b>).</>}</p>}
            {!r.duplicate && (canSeeLead(user, r.lead)
              ? <Link to={`/leads/${r.lead.id}`} onClick={onClose} className="mt-1 inline-block font-bold underline">Open lead →</Link>
              : <p className="mt-1 opacity-80">It's assigned to another agent, so it isn't visible in your view.</p>)}
          </div>
        </div>
      ))}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Close</Button>
        <Button onClick={() => sim.mutate(text)} disabled={sim.isPending}>Send to webhook</Button>
      </div>
    </div>
  )
}
