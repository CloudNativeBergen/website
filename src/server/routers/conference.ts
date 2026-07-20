import { TRPCError } from '@trpc/server'
import { revalidateTag } from 'next/cache'
import { headers } from 'next/headers'
import { router, adminProcedure, resolveConferenceId } from '../trpc'
import { clientWrite } from '@/lib/sanity/client'
import { ensureArrayKeys } from '@/lib/sanity/helpers'
import {
  CANNOT_REMOVE_CURRENT_DOMAIN,
  domainsWouldStrandHost,
} from '@/lib/conference/domains'
import {
  UpdateBasicInfoSchema,
  UpdateVenueSchema,
  UpdateDatesSchema,
  UpdateRegistrationSchema,
  UpdateCommunicationSchema,
  UpdateTicketingIdsSchema,
  UpdateCfpGoalsSchema,
  UpdateSocialLinksSchema,
  UpdateFeaturesSchema,
  UpdateVanityMetricsSchema,
  UpdateSponsorBenefitsSchema,
  UpdateSponsorshipCustomizationSchema,
  UpdateDomainsSchema,
} from '../schemas/conference'

/**
 * Field-scoped conference settings mutations (SE-1a).
 *
 * INVARIANT: every mutation resolves the conference id from the request domain
 * via {@link resolveConferenceId} (NEVER from client input) and patches ONLY the
 * fields of its own fieldset — following the tickets router precedent. A
 * whole-document replace is never performed.
 *
 * UNSET SEMANTICS: within a validated input, `undefined` leaves a field
 * untouched, whereas an explicit `null` unsets it. {@link applyConferencePatch}
 * routes provided-non-null values through Sanity `.set()` and nulls through
 * `.unset()`.
 */
async function applyConferencePatch(
  conferenceId: string,
  input: Record<string, unknown>,
  opts: {
    /**
     * When set, each input key is patched as a dot path under this parent
     * object (`<pathPrefix>.<key>`) and the parent is `setIfMissing`-ed first.
     * Used by object fieldsets (e.g. `sponsorshipCustomization`) so a save only
     * touches the subfields it knows about and never clobbers siblings.
     */
    pathPrefix?: string
  } = {},
) {
  const { pathPrefix } = opts
  const set: Record<string, unknown> = {}
  const unset: string[] = []

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue
    const path = pathPrefix ? `${pathPrefix}.${key}` : key
    if (value === null) {
      unset.push(path)
    } else {
      set[path] = value
    }
  }

  if (Object.keys(set).length === 0 && unset.length === 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'No updates provided',
    })
  }

  try {
    let patch = clientWrite.patch(conferenceId)
    if (pathPrefix) patch = patch.setIfMissing({ [pathPrefix]: {} })
    if (Object.keys(set).length > 0) patch = patch.set(set)
    if (unset.length > 0) patch = patch.unset(unset)
    const result = await patch.commit()

    // Bust the cached conference read so the server-rendered settings page (and
    // every other `getConferenceForCurrentDomain` consumer) reflects the change.
    revalidateTag('content:conferences', 'default')
    revalidateTag(`sanity:conference-${conferenceId}`, 'default')

    return { success: true, updated: result }
  } catch (error) {
    if (error instanceof TRPCError) throw error
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to update conference settings',
      cause: error,
    })
  }
}

export const conferenceRouter = router({
  updateBasicInfo: adminProcedure
    .input(UpdateBasicInfoSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      return applyConferencePatch(conferenceId, input)
    }),

  updateVenue: adminProcedure
    .input(UpdateVenueSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      return applyConferencePatch(conferenceId, input)
    }),

  updateDates: adminProcedure
    .input(UpdateDatesSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      return applyConferencePatch(conferenceId, input)
    }),

  updateRegistration: adminProcedure
    .input(UpdateRegistrationSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      return applyConferencePatch(conferenceId, input)
    }),

  updateCommunication: adminProcedure
    .input(UpdateCommunicationSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      return applyConferencePatch(conferenceId, input)
    }),

  updateTicketingIds: adminProcedure
    .input(UpdateTicketingIdsSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      return applyConferencePatch(conferenceId, input)
    }),

  updateCfpGoals: adminProcedure
    .input(UpdateCfpGoalsSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      return applyConferencePatch(conferenceId, input)
    }),

  // === SE-1b: array & object fieldsets =====================================

  updateSocialLinks: adminProcedure
    .input(UpdateSocialLinksSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      return applyConferencePatch(conferenceId, {
        socialLinks: input.socialLinks,
      })
    }),

  updateFeatures: adminProcedure
    .input(UpdateFeaturesSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      return applyConferencePatch(conferenceId, { features: input.features })
    }),

  updateVanityMetrics: adminProcedure
    .input(UpdateVanityMetricsSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      // Object array items need a stable `_key`; preserve any existing key and
      // mint one for new rows.
      return applyConferencePatch(conferenceId, {
        vanityMetrics: ensureArrayKeys(input.vanityMetrics, 'metric'),
      })
    }),

  updateSponsorBenefits: adminProcedure
    .input(UpdateSponsorBenefitsSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      // Drop optional `icon` when absent so we never store `icon: undefined`.
      const rows = input.sponsorBenefits.map((b) => ({
        title: b.title,
        description: b.description,
        ...(b.icon ? { icon: b.icon } : {}),
        ...(b._key ? { _key: b._key } : {}),
      }))
      return applyConferencePatch(conferenceId, {
        sponsorBenefits: ensureArrayKeys(rows, 'benefit'),
      })
    }),

  updateSponsorshipCustomization: adminProcedure
    .input(UpdateSponsorshipCustomizationSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      // Field-scoped: patch dot paths under the parent object so sibling
      // subfields we don't render are never touched.
      return applyConferencePatch(conferenceId, input, {
        pathPrefix: 'sponsorshipCustomization',
      })
    }),

  /**
   * SAFEGUARDED. In addition to the schema's shape/duplicate/hostname checks,
   * this mutation derives the request's current host SERVER-SIDE and refuses any
   * payload that would strand it (BAD_REQUEST). The client mirrors this with a
   * locked, non-removable row + a type-to-confirm gate, but the server is the
   * authority — a crafted request cannot bypass the guard.
   */
  updateDomains: adminProcedure
    .input(UpdateDomainsSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await resolveConferenceId()
      const host = (await headers()).get('host') || ''
      if (domainsWouldStrandHost(input.domains, host)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: CANNOT_REMOVE_CURRENT_DOMAIN,
        })
      }
      return applyConferencePatch(conferenceId, { domains: input.domains })
    }),
})
