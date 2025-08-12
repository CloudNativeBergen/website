import { NextAuthRequest, auth } from '@/lib/auth'
import { checkOrganizerAccess } from '@/lib/auth/admin'
import { SponsorInput } from '@/lib/sponsor/types'
import {
  getSponsor,
  updateSponsor,
  deleteSponsor,
  updateSponsorTierAssignment,
} from '@/lib/sponsor/sanity'
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
      console.error('Sponsor retrieval failed:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
        errorType:
          error instanceof Error ? error.constructor.name : typeof error,
        url: req.url,
      })
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
        console.error(
          `Sponsor validation failed for ${data.name || 'unknown sponsor'}:`,
          {
            sponsorId: id,
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

      // Get the current sponsor data for audience comparison
      const { sponsor: oldSponsor } = await getSponsor(id, true)

      // Extract tier ID from data for separate handling
      const { tierId, ...sponsorData } = data

      // Update the sponsor
      const { sponsor, error } = await updateSponsor(id, sponsorData)
      if (error) {
        return sponsorResponseError({
          error,
          message: 'Failed to update sponsor',
        })
      }

      // Handle tier assignment update if tierId is provided
      if (tierId && sponsor) {
        try {
          const { conference } = await getConferenceForCurrentDomain()
          if (conference) {
            const { error: tierError } = await updateSponsorTierAssignment(
              conference._id,
              sponsor.name,
              tierId,
            )
            if (tierError) {
              console.warn(
                `Failed to update sponsor tier assignment for ${sponsor.name}:`,
                tierError,
              )
              // Note: We don't fail the entire request if tier update fails
              // The sponsor details have already been saved successfully
            } else {
              console.log(
                `Sponsor tier assignment updated for ${sponsor.name} to tier ${tierId}`,
              )
            }
          }
        } catch (tierError) {
          console.warn(
            'Failed to update sponsor tier assignment, but sponsor was saved:',
            tierError,
          )
        }
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
      console.error('Sponsor update failed:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
        errorType:
          error instanceof Error ? error.constructor.name : typeof error,
        url: req.url,
      })
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
      console.error('Sponsor deletion failed:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
        errorType:
          error instanceof Error ? error.constructor.name : typeof error,
        url: req.url,
      })
      return sponsorResponseError({
        error: error as Error,
        message: 'Failed to process request',
      })
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) as any
