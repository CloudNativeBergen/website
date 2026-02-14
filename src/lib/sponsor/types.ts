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
  tierType: 'standard' | 'special' | 'addon'
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
  soldOut: boolean
  mostPopular: boolean
  maxQuantity?: number | null
}

export interface SponsorTierInput {
  title: string
  tagline: string
  tierType: 'standard' | 'special' | 'addon'
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
  soldOut: boolean
  mostPopular: boolean
  maxQuantity?: number | null
}

export type SponsorTierExisting = SponsorTier

export interface ConferenceSponsor {
  _sfcId?: string
  sponsor: {
    _id: string
    name: string
    website: string
    logo?: string | null
    logoBright?: string | null
  }
  tier: {
    _id?: string
    title: string
    tagline: string
    tierType?: 'standard' | 'special' | 'addon'
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
  isPrimary?: boolean
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
  logoBright?: string | null
  orgNumber?: string
  address?: string
  tierId?: string
}

export interface SponsorExisting {
  _id: string
  _createdAt: string
  _updatedAt: string
  name: string
  website: string
  logo?: string | null
  logoBright?: string | null
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
  isDefault?: boolean
  sortOrder?: number
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
