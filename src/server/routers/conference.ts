import { TRPCError } from '@trpc/server'
import { revalidateTag } from 'next/cache'
import { router, adminProcedure, resolveConferenceId } from '../trpc'
import { clientWrite } from '@/lib/sanity/client'
import {
  UpdateBasicInfoSchema,
  UpdateVenueSchema,
  UpdateDatesSchema,
  UpdateRegistrationSchema,
  UpdateCommunicationSchema,
  UpdateTicketingIdsSchema,
  UpdateCfpGoalsSchema,
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
) {
  const set: Record<string, unknown> = {}
  const unset: string[] = []

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue
    if (value === null) {
      unset.push(key)
    } else {
      set[key] = value
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
})
