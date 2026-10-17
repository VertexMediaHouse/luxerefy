// The WhatsApp platform itself (inbox, campaigns, chatbots) is separate. The CRM only sends approved
// templates from the lead card and receives the Meta webhook to keep leads + messages in sync.
// Production: these become the whatsapp-send and whatsapp-webhook Edge Functions (token lives there).
import { useMutation } from '@tanstack/react-query'
import { db, write } from '../../lib/mock/db'
import { canSeeLead, logActivity, parseWhatsApp, receiveWhatsApp, uid, type WaPayload } from '../../lib/rules'
import { useUser } from '../../lib/session'

export const WA_TEMPLATES = [
  { name: 'property_enquiry_followup', label: 'Enquiry follow-up', category: 'Marketing', body: 'Hi {{1}}, thank you for your interest in {{2}}. Sharing the details and brochure here. Would you like to schedule a private site visit? — Team Luxerefy' },
  { name: 'site_visit_confirmation', label: 'Site visit confirmation', category: 'Utility', body: 'Hi {{1}}, your site visit for {{2}} is confirmed. Your advisor will share the location pin shortly. — Team Luxerefy' },
  { name: 'brochure_share', label: 'Brochure & floor plans', category: 'Marketing', body: 'Hi {{1}}, as discussed, here are the brochure and floor plans for {{2}}. Happy to answer any questions.' },
  { name: 'price_update', label: 'Price / offer update', category: 'Marketing', body: 'Hi {{1}}, there is a pricing update on {{2}}. Reply YES and your advisor will call you with the details.' },
] as const

export const fillTemplate = (body: string, vars: string[]) => body.replace(/\{\{(\d)\}\}/g, (_, n) => vars[Number(n) - 1] ?? '')

export function useSendTemplate(leadId: string) {
  const user = useUser()
  return useMutation({
    mutationFn: ({ template, body }: { template: string; body: string }) =>
      write(() => {
        const lead = db.leads.find(l => l.id === leadId)
        if (!lead || !canSeeLead(user, lead)) throw new Error('Lead not found')
        const now = new Date().toISOString()
        lead.updated_at = now
        logActivity(db, leadId, 'whatsapp', `WhatsApp template "${template}" sent: "${body}"`, user.id, now, { template, direction: 'out', status: 'sent', wa_id: 'wamid.' + uid() })
      }),
  })
}

/** Mock of POST /functions/v1/whatsapp-webhook (Meta payload). */
export function useSimulateWhatsApp() {
  return useMutation({
    mutationFn: (raw: string) =>
      write(() => {
        let payload: WaPayload
        try { payload = JSON.parse(raw) } catch { throw new Error('Payload must be JSON in Meta\'s webhook format.') }
        const messages = parseWhatsApp(payload)
        if (!messages.length) throw new Error('No messages in payload — the webhook would just acknowledge it (200).')
        return messages.map(m => {
          const r = receiveWhatsApp(db, m)
          return r.duplicate ? { duplicate: true as const, name: m.name } : { duplicate: false as const, created: r.created, lead: r.lead, name: m.name, agent: db.profiles.find(p => p.id === r.lead.assigned_to)?.full_name ?? 'Unassigned' }
        })
      }),
  })
}
