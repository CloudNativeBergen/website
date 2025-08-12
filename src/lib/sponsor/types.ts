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

export type ContactRole = (typeof CONTACT_ROLE_OPTIONS)[number]

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

export interface ConferenceSponsorWithContact {
  sponsor: {
    _id: string
    name: string
    website: string
    logo: string
    org_number?: string
    contact_persons?: ContactPerson[]
    billing?: BillingInfo
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

// Admin-specific sponsor type with contact info
export interface SponsorWithContactInfo extends SponsorExisting {
  org_number?: string
  contact_persons?: ContactPerson[]
  billing?: BillingInfo
}

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
