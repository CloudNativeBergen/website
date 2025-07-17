import { SponsorTier } from '@/lib/conference/types'

export interface SponsorTierInput {
  title: string
  tagline: string
  price: Array<{
    amount: number
    currency: string
  }>
  perks: Array<{
    label: string
    description: string
  }>
  sold_out: boolean
  most_popular: boolean
}

export type SponsorTierExisting = SponsorTier

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

// Sponsor types
export interface SponsorInput {
  name: string
  website: string
  logo: string
}

export interface SponsorExisting {
  _id: string
  _createdAt: string
  _updatedAt: string
  name: string
  website: string
  logo: string
}

export interface SponsorResponse {
  sponsor?: SponsorExisting
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
  sponsors?: SponsorExisting[]
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
