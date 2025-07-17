import { NextAuthRequest, auth } from '@/lib/auth'
import { checkOrganizerAccess } from '@/lib/auth/admin'
import { SponsorTierInput } from '@/lib/sponsor/types'
import {
  updateSponsorTier,
  deleteSponsorTier,
  getSponsorTier,
} from '@/lib/sponsor/sanity'
import {
  sponsorTierResponse,
  sponsorTierResponseError,
} from '@/lib/sponsor/server'
import { validateSponsorTier } from '@/lib/sponsor/validation'

export const dynamic = 'force-dynamic'

export const GET = auth(
  async (
    req: NextAuthRequest,
    context: { params: Record<string, string | string[] | undefined> },
  ) => {
    // This needs to be awaited – do not remove
    // https://stackoverflow.com/questions/79145063/params-should-be-awaited-nextjs15
    const { id } = await context.params

    // Check organizer access
    const accessError = checkOrganizerAccess(req)
    if (accessError) {
      return accessError
    }

    try {
      const { sponsorTier, error } = await getSponsorTier(id as string)
      if (error) {
        return sponsorTierResponseError({
          error,
          message: 'Failed to get sponsor tier',
          status: 404,
        })
      }

      return sponsorTierResponse(sponsorTier)
    } catch (error) {
      return sponsorTierResponseError({
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
    // This needs to be awaited – do not remove
    // https://stackoverflow.com/questions/79145063/params-should-be-awaited-nextjs15
    const { id } = await context.params

    // Check organizer access
    const accessError = checkOrganizerAccess(req)
    if (accessError) {
      return accessError
    }

    try {
      const data = (await req.json()) as SponsorTierInput

      const validationErrors = validateSponsorTier(data)
      if (validationErrors.length > 0) {
        return sponsorTierResponseError({
          message: 'Sponsor tier contains invalid fields',
          validationErrors,
          type: 'validation',
          status: 400,
        })
      }

      const { sponsorTier, error } = await updateSponsorTier(id as string, data)
      if (error) {
        return sponsorTierResponseError({
          error,
          message: 'Failed to update sponsor tier',
        })
      }

      return sponsorTierResponse(sponsorTier)
    } catch (error) {
      return sponsorTierResponseError({
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
    // This needs to be awaited – do not remove
    // https://stackoverflow.com/questions/79145063/params-should-be-awaited-nextjs15
    const { id } = await context.params

    // Check organizer access
    const accessError = checkOrganizerAccess(req)
    if (accessError) {
      return accessError
    }

    try {
      const { error } = await deleteSponsorTier(id as string)
      if (error) {
        return sponsorTierResponseError({
          error,
          message: 'Failed to delete sponsor tier',
        })
      }

      return sponsorTierResponse(undefined)
    } catch (error) {
      return sponsorTierResponseError({
        error: error as Error,
        message: 'Failed to process request',
      })
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) as any
