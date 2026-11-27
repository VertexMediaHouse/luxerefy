// Mirrors the approved Postgres schema 1:1 so the mock swaps for Supabase per file.
export type Role = 'owner' | 'admin' | 'manager' | 'sales'
export type Tone = 'slate' | 'blue' | 'violet' | 'amber' | 'green' | 'red'
/** A stage id, not a fixed set: pipelines and their stages are rows now. See `stages.ts`. */
export type LeadStatus = string
export type LeadSource = '99acres' | 'magic_bricks' | 'social_media' | 'website' | 'property_page' | 'print_ad' | 'jbn' | 'referral' | 'walk_in' | 'sales_form' | 'other'
export type LeadType = 'apartment' | 'bungalow' | 'villa' | 'weekend_apartment' | 'weekend_villa'
export type ActivityType = 'created' | 'enquiry' | 'call' | 'text' | 'note' | 'status_change' | 'assignment' | 'follow_up'
export type PropertySegment = 'residential' | 'commercial'
/** The five kinds the dashboard breaks each locality down by. Both segments use the same list. */
export type PropertyCategory = 'apartment' | 'plot' | 'bungalow' | 'weekend_villa' | 'weekend_plot'
export type PropertyStatus = 'available' | 'reserved' | 'sold' | 'off_market'
export type TicketStatus = 'pending' | 'in_progress' | 'resolved'
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent'
export type TaskKind = 'call' | 'text' | 'follow_up' | 'site_visit' | 'meeting' | 'other'
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent'
export type GoalPeriod = 'weekly' | 'monthly' | 'yearly'
export type GoalMetric = 'potential_visits' | 'site_visits' | 'builder_meetings' | 'revenue'
export type AssignmentMethod = 'manual' | 'group' | 'filter' | 'round_robin' | 'quota' | 'csv'

export interface Profile {
  id: string
  full_name: string
  email: string
  phone: string
  role: Role
  active: boolean
  created_by?: string | null
  last_login?: string | null
  must_change_password?: boolean
}

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
  property_interest: string | null; locality: string | null; project: string | null; lead_type: LeadType | null
  budget_min: number | null; budget_max: number | null; city: string | null
  assigned_to: string | null
  assigned_by?: string | null
  assigned_at?: string | null
  assignment_method?: AssignmentMethod
  external_ref: string | null
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

export interface LeadAssignmentHistory {
  id: string
  lead_id: string
  assigned_from: string | null
  assigned_to: string | null
  assigned_by: string | null
  assignment_method: AssignmentMethod
  created_at: string
}

export interface LeadGroup {
  id: string
  name: string
  description: string
  color: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface LeadGroupMember {
  id: string
  group_id: string
  lead_id: string
  added_by: string | null
  added_at: string
}

export interface Task {
  id: string; title: string; kind: TaskKind; lead_id: string | null; property_id: string | null
  assigned_to: string; due_at: string; ends_at: string | null; status: 'pending' | 'done' | 'cancelled'
  created_by: string | null; created_at: string
  description?: string
  priority?: TaskPriority
  completed_at?: string | null
}

export interface Ticket {
  id: string; number: number; title: string; description: string; status: TicketStatus
  priority?: TicketPriority; lead_id?: string | null; property_id?: string | null
  raised_by: string; assigned_to?: string | null
  sla_due_at?: string; escalation_level?: number; escalated_at?: string | null
  in_progress_at: string | null; resolved_at: string | null; created_at: string
}

/** One target per (period, metric, user_id). Progress is always measured against the period in progress. */
export interface Goal {
  id: string; period: GoalPeriod; metric: GoalMetric; target: number
  /** Work completed outside the CRM, added by hand on top of the counted actual. */
  manual?: number
  user_id?: string | null
  created_at: string; updated_at: string
}

export type DocFolder = string

export interface DocFolderItem {
  id: string
  name: string
  parent_id: string | null
  color?: string
  icon?: string
  created_at: string
}

export interface Doc {
  id: string; lead_id: string | null; property_id: string | null; folder: string; folder_id?: string | null; name: string
  size: number; mime: string; storage_path: string; uploaded_by: string | null; created_at: string
  starred?: boolean
}

export interface AuditLogEntry {
  id: string
  actor_id: string | null
  action: string
  entity_type: string
  entity_id: string
  details: Record<string, unknown>
  ip_address: string | null
  created_at: string
}

export interface Tables {
  profiles: Profile[]; contacts: Contact[]; properties: Property[]; pipelines: Pipeline[]; stages: Stage[]; leads: Lead[]
  lead_activities: LeadActivity[]; tasks: Task[]; tickets: Ticket[]; documents: Doc[]; doc_folders?: DocFolderItem[]; goals: Goal[]
  lead_assignment_history?: LeadAssignmentHistory[]
  lead_groups?: LeadGroup[]
  lead_group_members?: LeadGroupMember[]
  audit_log?: AuditLogEntry[]
}
