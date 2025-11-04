export type SponsorStatus =
  | 'prospect'
  | 'contacted'
  | 'negotiating'
  | 'closed-won'
  | 'closed-lost'

export type InvoiceStatus =
  | 'not-sent'
  | 'sent'
  | 'paid'
  | 'overdue'
  | 'cancelled'

export type ActivityType =
  | 'stage_change'
  | 'invoice_status_change'
  | 'contract_signed'
  | 'note'
  | 'email'
  | 'call'
  | 'meeting'

export type SponsorTag =
  | 'warm-lead'
  | 'returning-sponsor'
  | 'cold-outreach'
  | 'referral'
  | 'high-priority'
  | 'needs-follow-up'
  | 'multi-year-potential'

export interface SponsorForConference {
  _id: string
  _createdAt: string
  _updatedAt: string
  sponsor: {
    _ref: string
  }
  conference: {
    _ref: string
  }
  tier?: {
    _ref: string
  }
  status: SponsorStatus
  assigned_to?: {
    _ref: string
  }
  contact_initiated_at?: string
  contract_signed_at?: string
  contract_value?: number
  contract_currency: 'NOK' | 'USD' | 'EUR'
  invoice_status: InvoiceStatus
  invoice_sent_at?: string
  invoice_paid_at?: string
  notes?: string
  tags?: SponsorTag[]
}

export interface SponsorForConferenceExpanded {
  _id: string
  _createdAt: string
  _updatedAt: string
  sponsor: {
    _id: string
    name: string
    website: string
    logo: string
    logo_bright?: string
    org_number?: string
  }
  conference: {
    _id: string
    title: string
  }
  tier?: {
    _id: string
    title: string
    tagline: string
    tier_type: 'standard' | 'special'
    price?: Array<{
      _key: string
      amount: number
      currency: string
    }>
  }
  status: SponsorStatus
  assigned_to?: {
    _id: string
    name: string
    email: string
    avatar?: string
  }
  contact_initiated_at?: string
  contract_signed_at?: string
  contract_value?: number
  contract_currency: 'NOK' | 'USD' | 'EUR'
  invoice_status: InvoiceStatus
  invoice_sent_at?: string
  invoice_paid_at?: string
  notes?: string
  tags?: SponsorTag[]
}

export interface SponsorActivityExpanded {
  _id: string
  _createdAt: string
  _updatedAt: string
  sponsor_for_conference: {
    _id: string
    sponsor: {
      _id: string
      name: string
    }
  }
  activity_type: ActivityType
  description: string
  metadata?: {
    old_value?: string
    new_value?: string
    timestamp?: string
    additional_data?: string
  }
  created_by: {
    _id: string
    name: string
    email: string
    avatar?: string
  }
  created_at: string
}

export interface SponsorForConferenceInput {
  sponsor: string
  conference: string
  tier?: string
  status: SponsorStatus
  assigned_to?: string
  contact_initiated_at?: string
  contract_signed_at?: string
  contract_value?: number
  contract_currency?: 'NOK' | 'USD' | 'EUR'
  invoice_status: InvoiceStatus
  invoice_sent_at?: string
  invoice_paid_at?: string
  notes?: string
  tags?: SponsorTag[]
}

export interface SponsorActivityInput {
  sponsor_for_conference: string
  activity_type: ActivityType
  description: string
  metadata?: {
    old_value?: string
    new_value?: string
    timestamp?: string
    additional_data?: string
  }
  created_by: string
  created_at?: string
}

export interface CopySponsorsParams {
  sourceConferenceId: string
  targetConferenceId: string
}

export interface CopySponsorsResult {
  created: number
  skipped: number
  warnings: string[]
}
