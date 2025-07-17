import { NextAuthRequest, auth } from '@/lib/auth'
import { checkOrganizerAccess } from '@/lib/auth/admin'
import { SponsorTierInput } from '@/lib/sponsor/types'
import { createSponsorTier } from '@/lib/sponsor/sanity'
import {
  sponsorTierResponse,
  sponsorTierResponseError,
} from '@/lib/sponsor/server'
import { validateSponsorTier } from '@/lib/sponsor/validation'

export const dynamic = 'force-dynamic'

export const POST = auth(async (req: NextAuthRequest) => {
  // Check organizer access
  const accessError = checkOrganizerAccess(req)
  if (accessError) {
    return accessError
  }

  try {
    const data = (await req.json()) as SponsorTierInput & { conference: string }

    const validationErrors = validateSponsorTier(data)
    if (validationErrors.length > 0) {
      return sponsorTierResponseError({
        message: 'Sponsor tier contains invalid fields',
        validationErrors,
        type: 'validation',
        status: 400,
      })
    }

    const { sponsorTier, error } = await createSponsorTier(data)
    if (error) {
      return sponsorTierResponseError({
        error,
        message: 'Failed to create sponsor tier',
      })
    }

    return sponsorTierResponse(sponsorTier)
  } catch (error) {
    return sponsorTierResponseError({
      error: error as Error,
      message: 'Failed to process request',
    })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any
