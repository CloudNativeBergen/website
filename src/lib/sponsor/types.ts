// Contact role options
export const CONTACT_ROLE_OPTIONS = [
  'Billing Reference',
  'Marketing',
  'Partnership Manager',
  'Technical Contact',
  'Executive Sponsor',
] as const

export type ContactRole = (typeof CONTACT_ROLE_OPTIONS)[number]

// Core sponsor types
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

export interface ConferenceSponsor {
  sponsor: {
    name: string
    website: string
    logo: string
  }
  tier: {
    title: string
    tagline: string
    tier_type?: 'standard' | 'special'
  }
}

export interface ConferenceSponsorWithContact {
  sponsor: {
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
  }
}

export interface SponsorTierResponse {
  sponsorTier?: SponsorTierExisting
  error?: {
    message: string
    type?: string
    status?: number
    validationErrors?: Array<{
      field: string
      message: string
    }>
  }
}

export interface SponsorTierListResponse {
  sponsorTiers?: SponsorTierExisting[]
  error?: {
    message: string
    type?: string
    status?: number
  }
}

export interface SponsorTierValidationError {
  field: string
  message: string
}

// Contact and billing information types
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

// Sponsor types
export interface SponsorInput {
  name: string
  website: string
  logo: string
  org_number?: string
  contact_persons?: ContactPerson[]
  billing?: BillingInfo
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

export interface SponsorResponse {
  sponsor?: SponsorExisting | SponsorWithContactInfo
  error?: {
    message: string
    type?: string
    status?: number
    validationErrors?: Array<{
      field: string
      message: string
    }>
  }
}

export interface SponsorListResponse {
  sponsors?: SponsorExisting[] | SponsorWithContactInfo[]
  error?: {
    message: string
    type?: string
    status?: number
  }
}

// Conference sponsor assignment types
export interface ConferenceSponsorInput {
  sponsorId: string
  tierId: string
}

export interface ConferenceSponsorResponse {
  success?: boolean
  error?: {
    message: string
    type?: string
    status?: number
  }
}
