import type { DocFolder, LeadSource, PropertyStatus, Role, TaskKind, TicketPriority, TicketStatus, Tone } from './types'

// Lead stages are no longer constants - they are rows a manager can edit. See ./stages.ts.
export type { Tone }

export const SOURCE_LABEL: Record<LeadSource, string> = {
  '99acres': '99acres', whatsapp: 'WhatsApp', website: 'Website', property_page: 'Property page',
  referral: 'Referral', walk_in: 'Walk-in', other: 'Other',
}

export const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', manager: 'Manager', agent: 'Agent' }

export const PROPERTY_STATUS_LABEL: Record<PropertyStatus, string> = { available: 'Available', reserved: 'Reserved', sold: 'Sold', off_market: 'Off market' }
export const PROPERTY_STATUS_TONE: Record<PropertyStatus, Tone> = { available: 'green', reserved: 'amber', sold: 'slate', off_market: 'slate' }

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = { pending: 'Pending', in_progress: 'In progress', resolved: 'Resolved' }
export const TICKET_STATUS_TONE: Record<TicketStatus, Tone> = { pending: 'amber', in_progress: 'blue', resolved: 'green' }
export const PRIORITY_LABEL: Record<TicketPriority, string> = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' }
export const PRIORITY_TONE: Record<TicketPriority, Tone> = { low: 'slate', normal: 'blue', high: 'amber', urgent: 'red' }

export const TASK_KIND_LABEL: Record<TaskKind, string> = { follow_up: 'Follow-up', site_visit: 'Site visit', meeting: 'Meeting', documents: 'Documents', approval: 'Approval', other: 'Other' }
export const TASK_KIND_TONE: Record<TaskKind, Tone> = { follow_up: 'blue', site_visit: 'green', meeting: 'violet', documents: 'amber', approval: 'red', other: 'slate' }
/** Kinds that occupy a time slot and so need an end time (calendar + double-booking guard). */
export const TIMED_KINDS: TaskKind[] = ['site_visit', 'meeting']

export const DOC_FOLDERS: DocFolder[] = ['Agreements', 'KYC', 'Property', 'Payments', 'Other']
