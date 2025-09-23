export const CONTACT_ROLE_OPTIONS = [
  'Billing Reference',
  'Marketing',
  'Partnership Manager',
  'Technical Contact',
  'Executive Sponsor',
] as const

export type ContactRole = (typeof CONTACT_ROLE_OPTIONS)[number]

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
    _id: string
    name: string
    website: string
    logo: string
    logo_bright?: string
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
    logo_bright?: string
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

export interface SponsorInput {
  name: string
  website: string
  logo: string
  logo_bright?: string
  org_number?: string
  contact_persons?: ContactPerson[]
  billing?: BillingInfo
  tierId?: string
}

export interface SponsorExisting {
  _id: string
  _createdAt: string
  _updatedAt: string
  name: string
  website: string
  logo: string
  logo_bright?: string
}

export interface SponsorWithContactInfo extends SponsorExisting {
  org_number?: string
  contact_persons?: ContactPerson[]
  billing?: BillingInfo
}

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
