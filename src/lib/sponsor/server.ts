import { NextResponse } from 'next/server'
import {
  SponsorTierExisting,
  SponsorTierResponse,
  SponsorTierListResponse,
  SponsorTierValidationError,
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
