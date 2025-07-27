import { NextAuthRequest, auth } from '@/lib/auth'
import { checkOrganizerAccess } from '@/lib/auth/admin'
import { SponsorInput } from '@/lib/sponsor/types'
import { getSponsor, updateSponsor, deleteSponsor } from '@/lib/sponsor/sanity'
import { sponsorResponse, sponsorResponseError } from '@/lib/sponsor/server'
import { validateSponsor } from '@/lib/sponsor/validation'

export const dynamic = 'force-dynamic'

export const GET = auth(
  async (
    req: NextAuthRequest,
    context: { params: Record<string, string | string[] | undefined> },
  ) => {
    // Check organizer access
    const accessError = checkOrganizerAccess(req)
    if (accessError) {
      return accessError
    }

    try {
      const id = context.params.id as string
      const { searchParams } = new URL(req.url!)
      const includeContactInfo =
        searchParams.get('includeContactInfo') === 'true'

      const { sponsor, error } = await getSponsor(id, includeContactInfo)
      if (error) {
        return sponsorResponseError({
          error,
          message: 'Failed to fetch sponsor',
          status: 404,
        })
      }

      return sponsorResponse(sponsor)
    } catch (error) {
      return sponsorResponseError({
        error: error as Error,
        message: 'Failed to process request',
      })
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) as any

export const PUT = auth(
  async (
    req: NextAuthRequest,
    context: { params: Record<string, string | string[] | undefined> },
  ) => {
    // Check organizer access
    const accessError = checkOrganizerAccess(req)
    if (accessError) {
      return accessError
    }

    try {
      const id = context.params.id as string
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

      const { sponsor, error } = await updateSponsor(id, data)
      if (error) {
        return sponsorResponseError({
          error,
          message: 'Failed to update sponsor',
        })
      }

      return sponsorResponse(sponsor)
    } catch (error) {
      return sponsorResponseError({
        error: error as Error,
        message: 'Failed to process request',
      })
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) as any

export const DELETE = auth(
  async (
    req: NextAuthRequest,
    context: { params: Record<string, string | string[] | undefined> },
  ) => {
    // Check organizer access
    const accessError = checkOrganizerAccess(req)
    if (accessError) {
      return accessError
    }

    try {
      const id = context.params.id as string
      const { error } = await deleteSponsor(id)
      if (error) {
        return sponsorResponseError({
          error,
          message: 'Failed to delete sponsor',
        })
      }

      return sponsorResponse(undefined)
    } catch (error) {
      return sponsorResponseError({
        error: error as Error,
        message: 'Failed to process request',
      })
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) as any
