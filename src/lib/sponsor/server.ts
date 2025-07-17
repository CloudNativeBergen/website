import { NextResponse } from 'next/server'
import {
  SponsorTierExisting,
  SponsorTierResponse,
  SponsorTierListResponse,
  SponsorTierValidationError,
  SponsorExisting,
  SponsorResponse,
  SponsorListResponse,
  ConferenceSponsorResponse,
} from './types'

export function sponsorTierResponse(
  sponsorTier: SponsorTierExisting | undefined,
): NextResponse {
  const response: SponsorTierResponse = {
    sponsorTier,
  }
  return NextResponse.json(response)
}

export function sponsorTierResponseError({
  message,
  type = 'server',
  status = 500,
  validationErrors,
}: {
  error?: Error
  message: string
  type?: string
  status?: number
  validationErrors?: SponsorTierValidationError[]
}): NextResponse {
  const response: SponsorTierResponse = {
    error: {
      message,
      type,
      status,
      validationErrors,
    },
  }
  return NextResponse.json(response, { status })
}

export function sponsorTierListResponse(
  sponsorTiers: SponsorTierExisting[],
): NextResponse {
  const response: SponsorTierListResponse = {
    sponsorTiers,
  }
  return NextResponse.json(response)
}

export function sponsorTierListResponseError({
  message,
  type = 'server',
  status = 500,
}: {
  error?: Error
  message: string
  type?: string
  status?: number
}): NextResponse {
  const response: SponsorTierListResponse = {
    error: {
      message,
      type,
      status,
    },
  }
  return NextResponse.json(response, { status })
}

// Sponsor response helpers
export function sponsorResponse(
  sponsor: SponsorExisting | undefined,
): NextResponse {
  const response: SponsorResponse = {
    sponsor,
  }
  return NextResponse.json(response)
}

export function sponsorResponseError({
  message,
  type = 'server',
  status = 500,
  validationErrors,
}: {
  error?: Error
  message: string
  type?: string
  status?: number
  validationErrors?: SponsorTierValidationError[]
}): NextResponse {
  const response: SponsorResponse = {
    error: {
      message,
      type,
      status,
      validationErrors,
    },
  }
  return NextResponse.json(response, { status })
}

export function sponsorListResponse(sponsors: SponsorExisting[]): NextResponse {
  const response: SponsorListResponse = {
    sponsors,
  }
  return NextResponse.json(response)
}

export function sponsorListResponseError({
  message,
  type = 'server',
  status = 500,
}: {
  error?: Error
  message: string
  type?: string
  status?: number
}): NextResponse {
  const response: SponsorListResponse = {
    error: {
      message,
      type,
      status,
    },
  }
  return NextResponse.json(response, { status })
}

// Conference sponsor response helpers
export function conferenceSponsorResponse(
  success: boolean = true,
): NextResponse {
  const response: ConferenceSponsorResponse = {
    success,
  }
  return NextResponse.json(response)
}

export function conferenceSponsorResponseError({
  message,
  type = 'server',
  status = 500,
}: {
  error?: Error
  message: string
  type?: string
  status?: number
}): NextResponse {
  const response: ConferenceSponsorResponse = {
    error: {
      message,
      type,
      status,
    },
  }
  return NextResponse.json(response, { status })
}
