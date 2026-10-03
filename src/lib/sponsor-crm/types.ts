import type { ConferenceTheme } from '@/lib/branding/theme'
import type { ContactPerson, BillingInfo } from '@/lib/sponsor/types'

export type SponsorStatus =
  'prospect' | 'contacted' | 'negotiating' | 'closed-won' | 'closed-lost'

export type InvoiceStatus =
  'not-sent' | 'sent' | 'paid' | 'overdue' | 'cancelled'

export type ContractStatus =
  | 'none'
  | 'verbal-agreement'
  | 'registration-sent'
  | 'contract-sent'
  | 'contract-signed'

export type SignatureStatus =
  'not-started' | 'pending' | 'signed' | 'rejected' | 'expired'

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
  // A sponsor↔organizer thread message (messaging G2b).
  | 'message'
  // Discount codes linked to the sponsor without a send (#1262).
  | 'discount_codes_assigned'

/**
 * What kind of email a sent-communication record is (#1261). Slice 1 sends
 * only `information`; the other kinds arrive with #1262–#1264 but the record
 * shape is shared so the audit view never has to change.
 */
export type CommunicationKind =
  'information' | 'contract' | 'registration' | 'discount'

export type CommunicationDeliveryStatus = 'sent' | 'failed'

/** A recipient AS SENT — a snapshot, not a reference into `contactPersons`. */
export interface CommunicationRecipient {
  contactKey: string
  name: string
  email: string
  role?: string
  /** The sponsor's primary contact at send time (the preselected default). */
  isDefault: boolean
}

export interface CommunicationAttachment {
  label: string
  url?: string
}

/**
 * One entry of `sponsorForConference.discountCodes` (#1262): a ticket discount
 * code given to this sponsor. Append-only; written by a discount send and by
 * the discount code manager's Assign action.
 */
export interface LinkedDiscountCode {
  _key: string
  code: string
  /** The provider's identifier. Checkin keys codes by the code string itself. */
  providerCodeId?: string
  linkedAt?: string
  /** `adopt`: owned by name until the sponsor's first link stored it. */
  linkedVia?: 'send' | 'assign' | 'create' | 'adopt'
}

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
  /** Set by the digital signing flow only — proves the stored document is signed. */
  contractSignedBy?: string
  /** Set while a contract send is in flight; cleared on contract-sent or failure. */
  contractReservedAt?: string
  /** Fingerprint of the terms the reserved PDF was rendered from. */
  contractReservedTerms?: string
  organizerSignedAt?: string
  organizerSignedBy?: string
  contractValue?: number
  contractCurrency: 'NOK' | 'USD' | 'EUR'
  invoiceStatus: InvoiceStatus
  invoiceSentAt?: string
  invoicePaidAt?: string
  tags?: SponsorTag[]
  registrationToken?: string
  registrationComplete?: boolean
  registrationCompletedAt?: string
  discountCodes?: LinkedDiscountCode[]
  nextFollowUpAt?: string
  outreachCount?: number
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
    linkedinUrl?: string
    blueskyHandle?: string
  }
  conference: {
    _id: string
    title: string
    organizer?: string
    organizerOrgNumber?: string
    organizerAddress?: string
    signingProvider?: 'self-hosted'
    city?: string
    country?: string
    venueName?: string
    venueAddress?: string
    startDate?: string
    endDate?: string
    sponsorEmail?: string
    domains?: string[]
    socialLinks?: string[]
    logoBright?: string
    /** Tenant brand theme — the contract emails are branded from it. */
    theme?: ConferenceTheme | null
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
  /** Set by the digital signing flow only — proves the stored document is signed. */
  contractSignedBy?: string
  /** Set while a contract send is in flight; cleared on contract-sent or failure. */
  contractReservedAt?: string
  /** Fingerprint of the terms the reserved PDF was rendered from. */
  contractReservedTerms?: string
  organizerSignedAt?: string
  organizerSignedBy?: string
  contractValue?: number
  contractCurrency: 'NOK' | 'USD' | 'EUR' | 'GBP'
  invoiceStatus: InvoiceStatus
  invoiceSentAt?: string
  invoicePaidAt?: string
  tags?: SponsorTag[]
  contactPersons?: ContactPerson[]
  billing?: BillingInfo
  registrationToken?: string
  registrationComplete?: boolean
  registrationCompletedAt?: string
  nextFollowUpAt?: string
  outreachCount?: number
  lastActivity?: {
    activityType: ActivityType
    description: string
    createdAt: string
    createdBy?: { _id: string; name: string } | null
  }
  activityCount?: number
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
  // Sent-communication SUMMARY (#1261): present only on records written by
  // `crm.sendCommunication`. The rendered body and attachments are NOT in the
  // list projection — `SponsorCommunicationRecord` carries them, on expand.
  communicationKind?: CommunicationKind
  recipients?: CommunicationRecipient[]
  subject?: string
  deliveryStatus?: CommunicationDeliveryStatus
  error?: string
  /** The stored reference, kept even when the template was later deleted. */
  templateId?: string | null
  /** Dereferenced title; `null` when no template was used OR it was deleted. */
  template?: { _id: string; title: string } | null
  templateEdited?: boolean
  providerMessageId?: string
}

export interface SponsorForConferenceInput {
  sponsor: string
  conference: string
  tier?: string
  addons?: string[]
  contractStatus: ContractStatus
  signatureStatus?: SignatureStatus
  signerName?: string | null
  signerEmail?: string | null
  signingUrl?: string | null
  contractTemplate?: string | null
  status: SponsorStatus
  assignedTo?: string | null
  contactPersons?: ContactPerson[] | null
  /**
   * Partial: a CRM edit may record an invoice format, a reference or a comment
   * before a billing email is known (`evaluateBilling` reports the rest as
   * gaps). `null` clears the stored object. See BillingInfoPatchSchema.
   */
  billing?: Partial<BillingInfo> | null
  contactInitiatedAt?: string | null
  contractSignedAt?: string | null
  organizerSignedAt?: string | null
  organizerSignedBy?: string | null
  contractValue?: number | null
  contractCurrency?: 'NOK' | 'USD' | 'EUR' | 'GBP'
  invoiceStatus: InvoiceStatus
  invoiceSentAt?: string | null
  invoicePaidAt?: string | null
  tags?: SponsorTag[]
  nextFollowUpAt?: string | null
  outreachCount?: number | null
}

/** The full audit record of one send, loaded on demand. */
export interface SponsorCommunicationRecord extends SponsorActivityExpanded {
  body?: string
  attachments?: CommunicationAttachment[]
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
  /**
   * TENANCY (#823). The REQUEST's organization, taken from the authorization
   * waist (`ctx.orgId`) and never from client input. Both conference ids above
   * ARE client input, so they are only honoured after an org-scoped read proves
   * they belong to this tenant. `null` (unresolvable host) fails closed.
   */
  organizationId: string | null
}

export interface CopySponsorsResult {
  created: number
  skipped: number
  warnings: string[]
}

export interface ImportAllHistoricSponsorsParams {
  targetConferenceId: string
  /** TENANCY (#823) — see {@link CopySponsorsParams.organizationId}. */
  organizationId: string | null
}

export interface ImportAllHistoricSponsorsResult {
  created: number
  skipped: number
  taggedAsReturning: number
  taggedAsDeclined: number
  sourceConferencesCount: number
}
