import type { ContactPerson, BillingInfo } from '@/lib/sponsor/types'

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

export type ContractStatus =
  | 'none'
  | 'verbal-agreement'
  | 'registration-sent'
  | 'contract-sent'
  | 'contract-signed'

export type SignatureStatus =
  | 'not-started'
  | 'pending'
  | 'signed'
  | 'rejected'
  | 'expired'

export type ActivityType =
  | 'stage_change'
  | 'invoice_status_change'
  | 'contract_status_change'
  | 'contract_signed'
  | 'note'
  | 'email'
  | 'call'
  | 'meeting'
  | 'signature_status_change'
  | 'registration_complete'
  | 'contract_reminder_sent'

export type SponsorTag =
  | 'warm-lead'
  | 'returning-sponsor'
  | 'cold-outreach'
  | 'referral'
  | 'high-priority'
  | 'needs-follow-up'
  | 'multi-year-potential'
  | 'previously-declined'

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
  contractStatus: ContractStatus
  signatureStatus?: SignatureStatus
  signatureId?: string
  signerName?: string
  signerEmail?: string
  signingUrl?: string
  contractSentAt?: string
  contractDocument?: {
    asset: { _ref: string }
  }
  reminderCount?: number
  contractTemplate?: {
    _ref: string
  }
  status: SponsorStatus
  assignedTo?: {
    _ref: string
  }
  contactPersons?: ContactPerson[]
  billing?: BillingInfo
  contactInitiatedAt?: string
  contractSignedAt?: string
  organizerSignedAt?: string
  organizerSignedBy?: string
  contractValue?: number
  contractCurrency: 'NOK' | 'USD' | 'EUR'
  invoiceStatus: InvoiceStatus
  invoiceSentAt?: string
  invoicePaidAt?: string
  notes?: string
  tags?: SponsorTag[]
  registrationToken?: string
  registrationComplete?: boolean
  registrationCompletedAt?: string
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
    logoBright?: string
    orgNumber?: string
    address?: string
  }
  conference: {
    _id: string
    title: string
    organizer?: string
    organizerOrgNumber?: string
    organizerAddress?: string
    signingProvider?: 'self-hosted' | 'adobe-sign'
    city?: string
    venueName?: string
    venueAddress?: string
    startDate?: string
    endDate?: string
    sponsorEmail?: string
    domains?: string[]
    socialLinks?: string[]
    logoBright?: string
  }
  tier?: {
    _id: string
    title: string
    tagline: string
    tierType: 'standard' | 'special'
    price?: Array<{
      _key: string
      amount: number
      currency: string
    }>
  }
  addons?: Array<{
    _id: string
    title: string
    tierType: 'addon'
    price?: Array<{
      _key: string
      amount: number
      currency: string
    }>
  }>
  contractStatus: ContractStatus
  signatureStatus?: SignatureStatus
  signatureId?: string
  signerName?: string
  signerEmail?: string
  signingUrl?: string
  contractSentAt?: string
  contractDocument?: {
    asset: {
      _ref: string
      url: string
    }
  }
  reminderCount?: number
  contractTemplate?: {
    _id: string
    title: string
  }
  status: SponsorStatus
  assignedTo?: {
    _id: string
    name: string
    email: string
    image?: string
  }
  contactInitiatedAt?: string
  contractSignedAt?: string
  organizerSignedAt?: string
  organizerSignedBy?: string
  contractValue?: number
  contractCurrency: 'NOK' | 'USD' | 'EUR' | 'GBP'
  invoiceStatus: InvoiceStatus
  invoiceSentAt?: string
  invoicePaidAt?: string
  notes?: string
  tags?: SponsorTag[]
  contactPersons?: ContactPerson[]
  billing?: BillingInfo
  registrationToken?: string
  registrationComplete?: boolean
  registrationCompletedAt?: string
}

export interface SponsorActivityExpanded {
  _id: string
  _createdAt: string
  _updatedAt: string
  sponsorForConference: {
    _id: string
    sponsor: {
      _id: string
      name: string
    }
  }
  activityType: ActivityType
  description: string
  metadata?: {
    oldValue?: string
    newValue?: string
    timestamp?: string
    additionalData?: string
  }
  createdBy: {
    _id: string
    name: string
    email: string
    image?: string
  } | null
  createdAt: string
}

export interface SponsorForConferenceInput {
  sponsor: string
  conference: string
  tier?: string
  addons?: string[]
  contractStatus: ContractStatus
  signatureStatus?: SignatureStatus
  signerName?: string
  signerEmail?: string
  signingUrl?: string | null
  contractTemplate?: string
  status: SponsorStatus
  assignedTo?: string | null
  contactPersons?: ContactPerson[]
  billing?: BillingInfo
  contactInitiatedAt?: string
  contractSignedAt?: string
  organizerSignedAt?: string
  organizerSignedBy?: string
  contractValue?: number
  contractCurrency?: 'NOK' | 'USD' | 'EUR' | 'GBP'
  invoiceStatus: InvoiceStatus
  invoiceSentAt?: string
  invoicePaidAt?: string
  notes?: string
  tags?: SponsorTag[]
}

export interface SponsorActivityInput {
  sponsorForConference: string
  activityType: ActivityType
  description: string
  metadata?: {
    oldValue?: string
    newValue?: string
    timestamp?: string
    additionalData?: string
  }
  createdBy: string
  createdAt?: string
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

export interface ImportAllHistoricSponsorsParams {
  targetConferenceId: string
}

export interface ImportAllHistoricSponsorsResult {
  created: number
  skipped: number
  taggedAsReturning: number
  taggedAsDeclined: number
  sourceConferencesCount: number
}
