// Mirrors the approved Postgres schema 1:1 so the mock swaps for Supabase per file.
export type Role = 'owner' | 'manager' | 'agent'
export type Tone = 'slate' | 'blue' | 'violet' | 'amber' | 'green' | 'red'
/** A stage id, not a fixed set: pipelines and their stages are rows now. See `stages.ts`. */
export type LeadStatus = string
export type LeadSource = '99acres' | 'social_media' | 'website' | 'property_page' | 'referral' | 'walk_in' | 'other'
export type ActivityType = 'created' | 'enquiry' | 'call' | 'text' | 'note' | 'status_change' | 'assignment' | 'follow_up'
export type PropertySegment = 'residential' | 'commercial'
/** The five kinds the dashboard breaks each locality down by. Both segments use the same list. */
export type PropertyCategory = 'apartment' | 'plot' | 'bungalow' | 'weekend_villa' | 'weekend_plot'
export type PropertyStatus = 'available' | 'reserved' | 'sold' | 'off_market'
export type TicketStatus = 'pending' | 'in_progress' | 'resolved'
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent'
export type TaskKind = 'call' | 'text' | 'follow_up' | 'site_visit' | 'meeting' | 'documents' | 'approval' | 'other'
export type GoalPeriod = 'weekly' | 'monthly' | 'yearly'
export type GoalMetric = 'leads' | 'won' | 'revenue' | 'site_visits'

export interface Profile { id: string; full_name: string; email: string; phone: string; role: Role; active: boolean }

/** A board. The lowest `position` is the default one new enquiries land in. */
export interface Pipeline { id: string; name: string; position: number; created_at: string }

/** A column of one pipeline. `kind` is carried in the id suffix too — see isOpen in rules.ts. */
export interface Stage {
  id: string; pipeline_id: string; label: string; tone: Tone; position: number
  kind: 'entry' | 'open' | 'won' | 'lost'
}

export interface Contact {
  id: string; name: string; phone: string; email: string | null
  kind: 'client' | 'lead' | 'vendor'; created_by: string | null; created_at: string
}

export interface Property {
  id: string; slug: string; title: string; project: string; config: string; area_sqft: number; price: number
  segment: PropertySegment; category: PropertyCategory
  locality: string; city: string; description: string; amenities: string[]; specs: Record<string, string>
  images: string[]; status: PropertyStatus; is_public: boolean; created_at: string; updated_at: string
}

export interface Lead {
  id: string; contact_id: string; source: LeadSource; pipeline_id: string; status: LeadStatus
  /** A buyer usually tours several places, so interest is a list. First one is the headline. */
  property_ids: string[]
  property_interest: string | null; budget_min: number | null; budget_max: number | null; city: string | null
  assigned_to: string | null; external_ref: string | null
  /** Who or which community sent a `referral` lead over. */
  referral_detail: string | null
  /** Free-text scratchpad for this lead, saved as typed. Separate from the activity log. */
  notes: string
  lost_reason: string | null; created_at: string; updated_at: string
}

export interface LeadActivity {
  id: string; lead_id: string; type: ActivityType; body: string
  meta: Record<string, unknown>; actor_id: string | null; created_at: string
}

export interface Task {
  id: string; title: string; kind: TaskKind; lead_id: string | null; property_id: string | null
  assigned_to: string; due_at: string; ends_at: string | null; status: 'pending' | 'done' | 'cancelled'
  created_by: string | null; created_at: string
}

export interface Ticket {
  id: string; number: number; title: string; description: string; status: TicketStatus; priority: TicketPriority
  lead_id: string | null; property_id: string | null; raised_by: string; assigned_to: string | null
  sla_due_at: string; escalation_level: number; escalated_at: string | null
  in_progress_at: string | null; resolved_at: string | null; created_at: string
}

/** One target per (period, metric). Progress is always measured against the period in progress. */
export interface Goal {
  id: string; period: GoalPeriod; metric: GoalMetric; target: number
  created_at: string; updated_at: string
}

export type DocFolder = 'Company Brochures' | 'General Documents' | 'Agreements' | 'KYC' | 'Other'

export interface Doc {
  id: string; lead_id: string | null; property_id: string | null; folder: DocFolder; name: string
  size: number; mime: string; storage_path: string; uploaded_by: string | null; created_at: string
}

export interface Tables {
  profiles: Profile[]; contacts: Contact[]; properties: Property[]; pipelines: Pipeline[]; stages: Stage[]; leads: Lead[]
  lead_activities: LeadActivity[]; tasks: Task[]; tickets: Ticket[]; documents: Doc[]; goals: Goal[]
}
