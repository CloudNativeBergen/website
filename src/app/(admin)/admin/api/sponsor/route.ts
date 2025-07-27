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
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { updateSponsorAudience } from '@/lib/sponsor/audience'

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
    const includeContactInfo = searchParams.get('includeContactInfo') === 'true'

    let result
    if (query) {
      result = await searchSponsors(query, includeContactInfo)
    } else {
      result = await getAllSponsors(includeContactInfo)
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
      console.error(
        `Sponsor validation failed for new sponsor ${data.name || 'unknown sponsor'}:`,
        {
          validationErrors: validationErrors.map((e) => ({
            field: e.field,
            message: e.message,
          })),
          sponsorData: {
            name: data.name,
            website: data.website,
            contactPersonsCount: data.contact_persons?.length || 0,
            hasBilling: !!data.billing,
          },
        },
      )
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

    // Update sponsor audience automatically when new sponsor is created
    try {
      const { conference } = await getConferenceForCurrentDomain()
      if (conference && sponsor) {
        const audienceResult = await updateSponsorAudience(
          conference,
          null, // No old sponsor data for creation
          sponsor,
        )

        if (audienceResult.success) {
          console.log(
            `Sponsor audience updated for new sponsor ${sponsor.name}: ${audienceResult.addedCount} added`,
          )
        } else {
          console.warn(
            `Failed to update sponsor audience for new sponsor ${sponsor.name}:`,
            audienceResult.error,
          )
        }
      }
    } catch (audienceError) {
      // Don't fail the sponsor creation if audience sync fails
      console.warn(
        'Failed to sync sponsor audience, but sponsor was created:',
        audienceError,
      )
    }

    return sponsorResponse(sponsor)
  } catch (error) {
    console.error('Sponsor creation failed:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      url: req.url,
    })
    return sponsorResponseError({
      error: error as Error,
      message: 'Failed to process request',
    })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any
