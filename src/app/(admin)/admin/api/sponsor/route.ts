import { NextAuthRequest, auth } from '@/lib/auth'
import { checkOrganizerAccess } from '@/lib/auth/admin'
import { SponsorInput } from '@/lib/sponsor/types'
import {
  createSponsor,
  getAllSponsors,
  searchSponsors,
} from '@/lib/sponsor/sanity'
import {
  sponsorResponse,
  sponsorResponseError,
  sponsorListResponse,
  sponsorListResponseError,
} from '@/lib/sponsor/server'
import { validateSponsor } from '@/lib/sponsor/validation'

export const dynamic = 'force-dynamic'

export const GET = auth(async (req: NextAuthRequest) => {
  // Check organizer access
  const accessError = checkOrganizerAccess(req)
  if (accessError) {
    return accessError
  }

  try {
    const { searchParams } = new URL(req.url!)
    const query = searchParams.get('q')

    let result
    if (query) {
      result = await searchSponsors(query)
    } else {
      result = await getAllSponsors()
    }

    const { sponsors, error } = result
    if (error) {
      return sponsorListResponseError({
        error,
        message: 'Failed to fetch sponsors',
      })
    }

    return sponsorListResponse(sponsors || [])
  } catch (error) {
    return sponsorListResponseError({
      error: error as Error,
      message: 'Failed to process request',
    })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any

export const POST = auth(async (req: NextAuthRequest) => {
  // Check organizer access
  const accessError = checkOrganizerAccess(req)
  if (accessError) {
    return accessError
  }

  try {
    const data = (await req.json()) as SponsorInput

    const validationErrors = validateSponsor(data)
    if (validationErrors.length > 0) {
      return sponsorResponseError({
        message: 'Sponsor contains invalid fields',
        validationErrors,
        type: 'validation',
        status: 400,
      })
    }

    const { sponsor, error } = await createSponsor(data)
    if (error) {
      return sponsorResponseError({
        error,
        message: 'Failed to create sponsor',
      })
    }

    return sponsorResponse(sponsor)
  } catch (error) {
    return sponsorResponseError({
      error: error as Error,
      message: 'Failed to process request',
    })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any
