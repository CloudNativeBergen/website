export const CONTACT_ROLE_OPTIONS = [
  'Billing Reference',
  'Marketing',
  'Partnership Manager',
  'Technical Contact',
  'Executive Sponsor',
] as const

export interface SponsorTier {
  _id: string
  _createdAt: string
  _updatedAt: string
  title: string
  tagline: string
  tier_type: 'standard' | 'special' | 'addon'
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
  max_quantity?: number
}

export interface SponsorTierInput {
  title: string
  tagline: string
  tier_type: 'standard' | 'special' | 'addon'
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
  max_quantity?: number
}

export type SponsorTierExisting = SponsorTier

export interface ConferenceSponsor {
  _sfcId?: string
  sponsor: {
    _id: string
    name: string
    website: string
    logo?: string | null
    logo_bright?: string | null
  }
  tier: {
    _id?: string
    title: string
    tagline: string
    tier_type?: 'standard' | 'special' | 'addon'
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
  is_primary?: boolean
}

export interface BillingInfo {
  email: string
  reference?: string
  comments?: string
}

export interface SponsorInput {
  name: string
  website: string
  logo?: string | null
  logo_bright?: string | null
  org_number?: string
  tierId?: string
}

export interface SponsorExisting {
  _id: string
  _createdAt: string
  _updatedAt: string
  name: string
  website: string
  logo?: string | null
  logo_bright?: string | null
}

export type TemplateCategory =
  | 'cold-outreach'
  | 'returning-sponsor'
  | 'international'
  | 'local-community'
  | 'follow-up'
  | 'custom'

export type TemplateLanguage = 'no' | 'en'

export interface SponsorEmailTemplate {
  _id: string
  _createdAt: string
  _updatedAt: string
  title: string
  slug: { current: string }
  category: TemplateCategory
  language: TemplateLanguage
  subject: string
  body?: PortableTextBlock[]
  description?: string
  is_default?: boolean
  sort_order?: number
}

export interface PortableTextBlock {
  _type: string
  _key: string
  children?: Array<{
    _type: string
    _key: string
    text?: string
    marks?: string[]
    [key: string]: unknown
  }>
  markDefs?: Array<Record<string, unknown>>
  style?: string
  listItem?: string
  level?: number
  [key: string]: unknown
}
