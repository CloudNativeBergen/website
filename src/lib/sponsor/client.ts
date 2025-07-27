import {
  SponsorInput,
  SponsorExisting,
  SponsorWithContactInfo,
  SponsorResponse,
  SponsorListResponse,
  SponsorTierInput,
  SponsorTierExisting,
  SponsorTierResponse,
  ConferenceSponsorInput,
  ConferenceSponsorResponse,
  SponsorTierValidationError,
} from './types'

/**
 * Custom error class for API errors that may include validation errors
 */
export class SponsorAPIError extends Error {
  public validationErrors?: SponsorTierValidationError[]
  public status?: number
  public type?: string

  constructor(
    message: string,
    validationErrors?: SponsorTierValidationError[],
    status?: number,
    type?: string,
  ) {
    super(message)
    this.name = 'SponsorAPIError'
    this.validationErrors = validationErrors
    this.status = status
    this.type = type
  }
}

/**
 * Client-side API functions for sponsor management
 */

// Sponsor functions
export async function fetchSponsors(
  includeContactInfo: boolean = false,
): Promise<SponsorExisting[] | SponsorWithContactInfo[]> {
  const url = includeContactInfo
    ? '/admin/api/sponsor?includeContactInfo=true'
    : '/admin/api/sponsor'

  const response = await fetch(url)
  const result: SponsorListResponse = await response.json()

  if (!response.ok) {
    throw new Error(result.error?.message || 'Failed to load sponsors')
  }

  return result.sponsors || []
}

export async function fetchSponsor(
  id: string,
  includeContactInfo: boolean = false,
): Promise<SponsorExisting | SponsorWithContactInfo> {
  const url = includeContactInfo
    ? `/admin/api/sponsor/${id}?includeContactInfo=true`
    : `/admin/api/sponsor/${id}`

  const response = await fetch(url)
  const result: SponsorResponse = await response.json()

  if (!response.ok) {
    throw new Error(result.error?.message || 'Failed to load sponsor')
  }

  if (!result.sponsor) {
    throw new Error('No sponsor data returned')
  }

  return result.sponsor
}

export async function createSponsor(
  data: SponsorInput,
): Promise<SponsorWithContactInfo> {
  const response = await fetch('/admin/api/sponsor', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

  const result: SponsorResponse = await response.json()

  if (!response.ok) {
    throw new SponsorAPIError(
      result.error?.message || 'Failed to create sponsor',
      result.error?.validationErrors,
      result.error?.status,
      result.error?.type,
    )
  }

  if (!result.sponsor) {
    throw new Error('No sponsor data returned')
  }

  return result.sponsor as SponsorWithContactInfo
}

export async function updateSponsor(
  id: string,
  data: SponsorInput,
): Promise<SponsorWithContactInfo> {
  const response = await fetch(`/admin/api/sponsor/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

  const result: SponsorResponse = await response.json()

  if (!response.ok) {
    throw new SponsorAPIError(
      result.error?.message || 'Failed to update sponsor',
      result.error?.validationErrors,
      result.error?.status,
      result.error?.type,
    )
  }

  if (!result.sponsor) {
    throw new Error('No sponsor data returned')
  }

  return result.sponsor as SponsorWithContactInfo
}

// Conference sponsor assignment functions
export async function addSponsorToConference(
  data: ConferenceSponsorInput,
): Promise<void> {
  const response = await fetch('/admin/api/sponsor/conference', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

  const result: ConferenceSponsorResponse = await response.json()

  if (!response.ok) {
    throw new Error(
      result.error?.message || 'Failed to add sponsor to conference',
    )
  }
}

export async function removeSponsorFromConference(
  sponsorId: string,
): Promise<void> {
  const response = await fetch(
    `/admin/api/sponsor/conference?sponsorId=${sponsorId}`,
    {
      method: 'DELETE',
    },
  )

  const result: ConferenceSponsorResponse = await response.json()

  if (!response.ok) {
    throw new Error(result.error?.message || 'Failed to remove sponsor')
  }
}

// Sponsor tier functions
export async function createSponsorTier(
  data: SponsorTierInput,
  conferenceId: string,
): Promise<SponsorTierExisting> {
  const response = await fetch('/admin/api/sponsor/tier', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...data, conference: conferenceId }),
  })

  const result: SponsorTierResponse = await response.json()

  if (!response.ok) {
    throw new Error(result.error?.message || 'Failed to create sponsor tier')
  }

  if (!result.sponsorTier) {
    throw new Error('No sponsor tier data returned')
  }

  return result.sponsorTier
}

export async function updateSponsorTier(
  tierId: string,
  data: SponsorTierInput,
): Promise<SponsorTierExisting> {
  const response = await fetch(`/admin/api/sponsor/tier/${tierId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

  const result: SponsorTierResponse = await response.json()

  if (!response.ok) {
    throw new Error(result.error?.message || 'Failed to update sponsor tier')
  }

  if (!result.sponsorTier) {
    throw new Error('No sponsor tier data returned')
  }

  return result.sponsorTier
}

export async function deleteSponsorTier(tierId: string): Promise<void> {
  const response = await fetch(`/admin/api/sponsor/tier/${tierId}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    const result = await response.json()
    throw new Error(result.error?.message || 'Failed to delete sponsor tier')
  }
}
