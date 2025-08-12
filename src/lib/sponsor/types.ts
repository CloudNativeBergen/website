/**
 * Sponsor Type Definitions
 *
 * Migration Status:
 * ✅ Sponsor CRUD operations: Fully migrated to tRPC
 * ✅ Sponsor Tier management: Fully migrated to tRPC
 * ✅ Conference-sponsor assignments: Fully migrated to tRPC
 * ✅ Sponsor removal: Fixed and working correctly
 * 🔄 Email functionality: Still uses REST API (maintains minimal response wrapper types)
 *
 * All sponsor management operations now use tRPC for type-safe, end-to-end communication.
 * The sponsor removal functionality correctly removes sponsors from conferences without
 * deleting the sponsor entity. Core types include sponsor _id for proper identification.
 */

export const CONTACT_ROLE_OPTIONS = [
  'Billing Reference',
  'Marketing',
  'Partnership Manager',
  'Technical Contact',
  'Executive Sponsor',
] as const

export const SPONSOR_STATUS_OPTIONS = [
  // Pre-engagement
  'potential', // Initial lead/prospect
  'contacted', // First contact made
  'dialog', // Active discussions

  // Negotiation Phase
  'proposal_sent', // Sponsorship proposal sent
  'negotiating', // Terms being negotiated
  'declined', // Sponsor declined

  // Contract Phase
  'contract_sent', // Contract sent for signing
  'contract_signed', // Contract signed by sponsor
  'confirmed', // Sponsorship confirmed

  // Invoice Phase
  'invoice_pending', // Invoice to be sent
  'invoice_sent', // Invoice sent
  'invoice_overdue', // Payment overdue
  'paid', // Fully paid
  'partial_paid', // Partially paid

  // Completion
  'fulfilled', // Sponsorship delivered
  'completed', // Conference completed

  // Special Cases
  'cancelled', // Sponsorship cancelled
  'refunded', // Payment refunded
] as const

export const INVOICE_STATUS_OPTIONS = [
  'pending',
  'sent',
  'paid',
  'overdue',
  'cancelled',
  'partial',
] as const

export const SPONSOR_STATUS_CATEGORIES = {
  prospect: ['potential', 'contacted', 'dialog'],
  negotiation: ['proposal_sent', 'negotiating', 'declined'],
  contract: ['contract_sent', 'contract_signed', 'confirmed'],
  financial: [
    'invoice_pending',
    'invoice_sent',
    'invoice_overdue',
    'paid',
    'partial_paid',
  ],
  fulfillment: ['fulfilled', 'completed'],
  inactive: ['cancelled', 'refunded', 'declined'],
} as const

export type ContactRole = (typeof CONTACT_ROLE_OPTIONS)[number]
export type SponsorStatus = (typeof SPONSOR_STATUS_OPTIONS)[number]
export type InvoiceStatus = (typeof INVOICE_STATUS_OPTIONS)[number]

// Timeline tracking for sponsor lifecycle
export interface SponsorStatusEntry {
  _key: string
  status: SponsorStatus
  date: string // ISO date string
  notes?: string
  updated_by?: string // Admin user who made the change
}

// Contract information
export interface ContractInfo {
  sent_date?: string
  signed_date?: string
  contract_ref?: string
  terms?: string
  special_conditions?: string
  notes?: string
}

// Communication tracking
export interface CommunicationEntry {
  _key: string
  date: string
  type: 'email' | 'call' | 'meeting' | 'other'
  subject?: string
  notes?: string
  attendees?: string[]
  next_action?: string
  next_action_date?: string
}

// Complete sponsor relationship tracking
export interface SponsorRelationship {
  // Current status
  current_status: SponsorStatus
  status_updated: string // Last status update date

  // Status history
  status_history?: SponsorStatusEntry[]

  // Contract information
  contract?: ContractInfo

  // Invoice information
  invoice?: InvoiceInfo

  // Communication history
  communications?: CommunicationEntry[]

  // Key dates
  first_contact_date?: string
  proposal_sent_date?: string
  contract_sent_date?: string
  confirmed_date?: string

  // Relationship metadata
  lead_source?: string // How we found them
  priority?: 'low' | 'medium' | 'high' | 'critical'
  assigned_to?: string // Team member responsible

  // Notes and reminders
  internal_notes?: string
  next_followup_date?: string
  next_followup_action?: string
}

// Invoice information types (enhanced)
export interface InvoiceInfo {
  status?: InvoiceStatus
  date?: string // ISO date string
  due_date?: string // ISO date string
  their_ref?: string
  our_ref?: string
  amount?: number
  currency?: string
  payment_terms?: string // e.g., "Net 30", "Due on receipt"
  notes?: string
  payment_date?: string // When payment was received
  payment_method?: string // Bank transfer, card, etc.
}

export interface InvoiceFormData {
  status?: InvoiceStatus
  date?: string
  due_date?: string
  their_ref?: string
  our_ref?: string
  amount?: number
  currency?: string
  payment_terms?: string
  notes?: string
  payment_date?: string
  payment_method?: string
}

// Core sponsor types - Used by both tRPC and REST APIs
export interface SponsorTier {
  _id: string
  _createdAt: string
  _updatedAt: string
  title: string
  tagline: string
  tier_type: 'standard' | 'special'
  price?: Array<{
    _key: string
    amount: number
    currency: string
  }>
  perks?: Array<{
    _key: string
    label: string
    description: string
  }>
  sold_out: boolean
  most_popular: boolean
}

export interface SponsorTierInput {
  title: string
  tagline: string
  tier_type: 'standard' | 'special'
  price?: Array<{
    _key?: string
    amount: number
    currency: string
  }>
  perks?: Array<{
    _key?: string
    label: string
    description: string
  }>
  sold_out: boolean
  most_popular: boolean
}

export type SponsorTierExisting = SponsorTier

// Conference sponsor types - Used by UI components and data layer
export interface ConferenceSponsor {
  sponsor: {
    _id: string
    name: string
    website: string
    logo: string
  }
  tier: {
    title: string
    tagline: string
    tier_type?: 'standard' | 'special'
    price?: Array<{
      _key: string
      amount: number
      currency: string
    }>
  }
}

export interface ConferenceSponsorDetailed {
  sponsor: {
    _id: string
    name: string
    website: string
    logo: string
    org_number?: string
    contact_persons?: ContactPerson[]
    billing?: BillingInfo
    invoice?: InvoiceInfo
    relationship?: SponsorRelationship
  }
  tier: {
    title: string
    tagline: string
    tier_type?: 'standard' | 'special'
    price?: Array<{
      _key: string
      amount: number
      currency: string
    }>
  }
}

export interface ConferenceSponsorWithRelationship {
  sponsor: {
    _id: string
    name: string
    website: string
    logo: string
    org_number?: string
    contact_persons?: ContactPerson[]
    billing?: BillingInfo
    relationship?: SponsorRelationship
  }
  tier: {
    title: string
    tagline: string
    tier_type?: 'standard' | 'special'
    price?: Array<{
      _key: string
      amount: number
      currency: string
    }>
  }
}

// Contact and billing information types - Used by tRPC and UI components
export interface ContactPerson extends Record<string, unknown> {
  _key: string
  name: string
  email: string
  phone?: string
  role?: string
}

export interface BillingInfo {
  email: string
  reference?: string
  comments?: string
}

export interface BillingFormData {
  email?: string
  reference?: string
  comments?: string
}

// Sponsor types - Core data structures used by tRPC
export interface SponsorInput {
  name: string
  website: string
  logo: string
  org_number?: string
  contact_persons?: ContactPerson[]
  billing?: BillingInfo
  invoice?: InvoiceInfo
  relationship?: SponsorRelationship
  // Optional tier ID for updating sponsor tier assignment
  tierId?: string
}

export interface SponsorExisting {
  _id: string
  _createdAt: string
  _updatedAt: string
  name: string
  website: string
  logo: string
}

// Admin-specific sponsor type with complete details
export interface SponsorDetailed extends SponsorExisting {
  org_number?: string
  contact_persons?: ContactPerson[]
  billing?: BillingInfo
  invoice?: InvoiceInfo
  relationship?: SponsorRelationship
}

// Legacy type aliases for backward compatibility
export type SponsorWithContactInfo = SponsorDetailed
export type ConferenceSponsorWithContact = ConferenceSponsorDetailed

// Conference sponsor assignment types
export interface ConferenceSponsorInput {
  sponsorId: string
  tierId: string
}

// REST API Response types - Only used by remaining email functionality
export interface ConferenceSponsorResponse {
  success?: boolean
  error?: {
    message: string
    type?: string
    status?: number
  }
}
