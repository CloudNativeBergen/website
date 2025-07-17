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
