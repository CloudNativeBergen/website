import { NextAuthRequest, auth } from '@/lib/auth'
import { checkOrganizerAccess } from '@/lib/auth/admin'
import { SponsorInput } from '@/lib/sponsor/types'
import { getSponsor, updateSponsor, deleteSponsor } from '@/lib/sponsor/sanity'
import { sponsorResponse, sponsorResponseError } from '@/lib/sponsor/server'
import { validateSponsor } from '@/lib/sponsor/validation'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { updateSponsorAudience } from '@/lib/sponsor/audience'

export const dynamic = 'force-dynamic'

export const GET = auth(
  async (
    req: NextAuthRequest,
    context: { params: Promise<Record<string, string | string[] | undefined>> },
  ) => {
    // Check organizer access
    const accessError = checkOrganizerAccess(req)
    if (accessError) {
      return accessError
    }

    try {
      const params = await context.params
      const id = params.id as string
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
    context: { params: Promise<Record<string, string | string[] | undefined>> },
  ) => {
    // Check organizer access
    const accessError = checkOrganizerAccess(req)
    if (accessError) {
      return accessError
    }

    try {
      const params = await context.params
      const id = params.id as string
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

      // Get the current sponsor data for audience comparison
      const { sponsor: oldSponsor } = await getSponsor(id, true)

      // Update the sponsor
      const { sponsor, error } = await updateSponsor(id, data)
      if (error) {
        return sponsorResponseError({
          error,
          message: 'Failed to update sponsor',
        })
      }

      // Update sponsor audience automatically when contacts change
      try {
        const { conference } = await getConferenceForCurrentDomain()
        if (conference) {
          const audienceResult = await updateSponsorAudience(
            conference,
            oldSponsor || null,
            sponsor!,
          )

          if (audienceResult.success) {
            console.log(
              `Sponsor audience updated for ${sponsor!.name}: ${audienceResult.addedCount} added, ${audienceResult.removedCount} removed`,
            )
          } else {
            console.warn(
              `Failed to update sponsor audience for ${sponsor!.name}:`,
              audienceResult.error,
            )
          }
        }
      } catch (audienceError) {
        // Don't fail the sponsor update if audience sync fails
        console.warn(
          'Failed to sync sponsor audience, but sponsor was saved:',
          audienceError,
        )
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
    context: { params: Promise<Record<string, string | string[] | undefined>> },
  ) => {
    // Check organizer access
    const accessError = checkOrganizerAccess(req)
    if (accessError) {
      return accessError
    }

    try {
      const params = await context.params
      const id = params.id as string

      // Get the sponsor data before deletion for audience cleanup
      const { sponsor: sponsorToDelete } = await getSponsor(id, true)

      const { error } = await deleteSponsor(id)
      if (error) {
        return sponsorResponseError({
          error,
          message: 'Failed to delete sponsor',
        })
      }

      // Update sponsor audience automatically when sponsor is deleted
      try {
        const { conference } = await getConferenceForCurrentDomain()
        if (conference && sponsorToDelete) {
          // Create empty sponsor with same name to trigger removal of contacts
          const emptySponsor = {
            ...sponsorToDelete,
            contact_persons: [], // Empty contacts to trigger removal
          }

          const audienceResult = await updateSponsorAudience(
            conference,
            sponsorToDelete,
            emptySponsor,
          )

          if (audienceResult.success) {
            console.log(
              `Sponsor audience updated after deleting ${sponsorToDelete.name}: ${audienceResult.removedCount} removed`,
            )
          } else {
            console.warn(
              `Failed to update sponsor audience after deleting ${sponsorToDelete.name}:`,
              audienceResult.error,
            )
          }
        }
      } catch (audienceError) {
        // Don't fail the sponsor deletion if audience sync fails
        console.warn(
          'Failed to sync sponsor audience, but sponsor was deleted:',
          audienceError,
        )
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
