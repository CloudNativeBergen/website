import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { adminProcedure, router } from '../trpc'
import { notFoundMessage, requireDocumentInCurrentConference } from '../tenancy'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { isWorkshopsEnabledForConference } from '@/lib/features/workshops'
import { workshopPortalUrl } from '@/lib/workshop/sign-in'
import {
  createEarlyAccessLink,
  earlyAccessUrl,
  expireEarlyAccessLinks,
  readEarlyAccessToken,
  revokeEarlyAccessLink,
} from '@/lib/workshop/early-access'

/**
 * A SPONSOR'S WORKSHOP EARLY-ACCESS LINK, for organizers (#1346, spec §4 and
 * §8). Mounted as `sponsor.crm.earlyAccess`.
 *
 * EVERY PROCEDURE CHECKS THE SPONSOR FIRST: the id is client input, and
 * `requireDocumentInCurrentConference` proves it names a sponsor of the
 * request's conference before anything about that sponsor is read or written.
 * A foreign id is refused exactly as a missing one.
 */

const SponsorInput = z.object({ sponsorForConferenceId: z.string().min(1) })

/**
 * Organizer of this organization AND the conference has workshops: the gate of
 * `workshop.admin`, asked with the domain conference, before anything is read.
 */
const workshopOrganizerProcedure = adminProcedure.use(async ({ next }) => {
  const { conference, error } = await getConferenceForCurrentDomain()
  if (!(await isWorkshopsEnabledForConference(error ? null : conference))) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'The "workshops" feature is not enabled for this organization',
    })
  }
  return next()
})

/**
 * Where the portal is, for a link that leaves the request: the conference's
 * main host when it can sign people in. A LIVE READ, made only when an address
 * is asked for. Refused, with the reason, when there is none: a link there
 * would open nothing.
 */
async function requirePortalUrl(): Promise<string> {
  const { conference, error } = await getConferenceForCurrentDomain()
  const portalUrl =
    error || !conference ? null : await workshopPortalUrl(conference)
  if (!portalUrl) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message:
        'This conference has no working workshop portal: its main domain cannot sign attendees in yet. Verify the domain under Settings, then try again.',
    })
  }
  return portalUrl
}

export const sponsorEarlyAccessRouter = router({
  /**
   * Create the sponsor's link, or answer the one it has: written only if none
   * is stored. Only for a sponsor with a won deal.
   */
  create: workshopOrganizerProcedure
    .input(SponsorInput)
    .mutation(async ({ input }) => {
      const conferenceId = await requireDocumentInCurrentConference(
        input.sponsorForConferenceId,
        'sponsorForConference',
      )
      const portalUrl = await requirePortalUrl()
      const result = await createEarlyAccessLink(
        conferenceId,
        input.sponsorForConferenceId,
      )
      if ('refused' in result) {
        throw result.refused === 'not-won'
          ? new TRPCError({
              code: 'PRECONDITION_FAILED',
              message:
                'An early-access link can only be created for a sponsor with a won deal. Move the sponsor to Closed Won first.',
            })
          : new TRPCError({
              code: 'NOT_FOUND',
              message: notFoundMessage('sponsorForConference'),
            })
      }
      expireEarlyAccessLinks(conferenceId)
      return { url: earlyAccessUrl(portalUrl, result.token) }
    }),

  /**
   * The address of the link the sponsor has, for copying. It never creates
   * one, so a copy cannot undo a revoke, and it does not ask about the deal: a
   * link that exists keeps working.
   */
  address: workshopOrganizerProcedure
    .input(SponsorInput)
    .query(async ({ input }) => {
      const conferenceId = await requireDocumentInCurrentConference(
        input.sponsorForConferenceId,
        'sponsorForConference',
      )
      const portalUrl = await requirePortalUrl()
      const token = await readEarlyAccessToken(
        conferenceId,
        input.sponsorForConferenceId,
      )
      if (!token) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'This sponsor has no early-access link.',
        })
      }
      return { url: earlyAccessUrl(portalUrl, token) }
    }),

  /**
   * Revoke the sponsor's link. Not gated on the workshop feature: a conference
   * that has turned workshops off can still end its links.
   */
  revoke: adminProcedure.input(SponsorInput).mutation(async ({ input }) => {
    const conferenceId = await requireDocumentInCurrentConference(
      input.sponsorForConferenceId,
      'sponsorForConference',
    )
    await revokeEarlyAccessLink(input.sponsorForConferenceId)
    expireEarlyAccessLinks(conferenceId)
    return { success: true as const }
  }),
})
