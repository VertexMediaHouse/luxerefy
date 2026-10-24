import type { DocFolder, GoalMetric, GoalPeriod, LeadSource, PropertyCategory, PropertySegment, PropertyStatus, Role, TaskKind, TicketPriority, TicketStatus, Tone } from './types'

// Lead stages are no longer constants - they are rows a manager can edit. See ./stages.ts.
export type { Tone }

export const SOURCE_LABEL: Record<LeadSource, string> = {
  '99acres': '99acres', social_media: 'Social media', website: 'Website', property_page: 'Property page',
  referral: 'Referral', walk_in: 'Walk-in', sales_form: 'Sales form', other: 'Other',
}
/** The three cuts the dashboard offers. `mine` is derived, not a source — see addedByMe in rules.ts. */
export const LEAD_CUTS = [
  { value: '', label: 'All leads' },
  { value: '99acres', label: '99acres' },
  { value: 'social_media', label: 'Social media' },
  { value: 'mine', label: 'Added by me' },
] as const
export type LeadCut = (typeof LEAD_CUTS)[number]['value']

export const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', manager: 'Manager', agent: 'Agent' }

export const PROPERTY_STATUS_LABEL: Record<PropertyStatus, string> = { available: 'Available', reserved: 'Reserved', sold: 'Sold', off_market: 'Off market' }
export const PROPERTY_STATUS_TONE: Record<PropertyStatus, Tone> = { available: 'green', reserved: 'amber', sold: 'slate', off_market: 'slate' }

export const SEGMENT_LABEL: Record<PropertySegment, string> = { residential: 'Residential', commercial: 'Commercial' }
export const SEGMENTS: PropertySegment[] = ['residential', 'commercial']
export const CATEGORY_LABEL: Record<PropertyCategory, string> = {
  apartment: 'Apartments', plot: 'Plots', bungalow: 'Bungalows', weekend_villa: 'Weekend villas', weekend_plot: 'Weekend plots',
}
export const CATEGORIES: PropertyCategory[] = ['apartment', 'plot', 'bungalow', 'weekend_villa', 'weekend_plot']

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = { pending: 'Pending', in_progress: 'In progress', resolved: 'Resolved' }
export const TICKET_STATUS_TONE: Record<TicketStatus, Tone> = { pending: 'amber', in_progress: 'blue', resolved: 'green' }
export const PRIORITY_LABEL: Record<TicketPriority, string> = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' }
export const PRIORITY_TONE: Record<TicketPriority, Tone> = { low: 'slate', normal: 'blue', high: 'amber', urgent: 'red' }

export const TASK_KIND_LABEL: Record<TaskKind, string> = { call: 'Call', text: 'Text', follow_up: 'Follow-up', site_visit: 'Site visit', meeting: 'Meeting', documents: 'Documents', approval: 'Approval', other: 'Other' }
export const TASK_KIND_TONE: Record<TaskKind, Tone> = { call: 'blue', text: 'violet', follow_up: 'blue', site_visit: 'green', meeting: 'violet', documents: 'amber', approval: 'red', other: 'slate' }
/** Kinds that occupy a time slot and so need an end time (calendar + double-booking guard). */
export const TIMED_KINDS: TaskKind[] = ['site_visit', 'meeting']
/** Offered in the lead's "what next" picker, in the order they usually happen. */
export const NEXT_ACTIONS: TaskKind[] = ['call', 'text', 'meeting', 'site_visit']

export const GOAL_PERIOD_LABEL: Record<GoalPeriod, string> = { weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' }
export const GOAL_PERIODS: GoalPeriod[] = ['weekly', 'monthly', 'yearly']
export const GOAL_METRIC_LABEL: Record<GoalMetric, string> = { leads: 'New leads', won: 'Leads won', revenue: 'Revenue booked', site_visits: 'Site visits done' }
export const GOAL_METRICS: GoalMetric[] = ['leads', 'won', 'revenue', 'site_visits']

export const DOC_FOLDERS: DocFolder[] = ['Company Brochures', 'General Documents', 'Agreements', 'KYC', 'Other']
