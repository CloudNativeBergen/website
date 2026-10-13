import { TRPCError } from '@trpc/server'
import { adminProcedure, router } from '../trpc'
import { workshopAdminProcedure } from '../workshopAdmin'
// One sponsor by `sponsorForConferenceId`: the schema the discount-code picker
// defined first, under the name of what it was first used for.
import { SponsorDiscountCodeOptionsSchema as SponsorOfConferenceSchema } from '../schemas/sponsorForConference'
import { notFoundMessage, requireDocumentInCurrentConference } from '../tenancy'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import {
  createEarlyAccessLink,
  earlyAccessPortalUrl,
  earlyAccessUrl,
  expireEarlyAccessLinks,
  expireEarlyAccessLinksIfTheyDisagree,
  readEarlyAccessToken,
  revokeEarlyAccessLink,
} from '@/lib/workshop/early-access'

/**
 * A SPONSOR'S WORKSHOP EARLY-ACCESS LINK, for organizers (#1346, spec §4 and
 * §8). Mounted as `sponsor.crm.earlyAccess`.
 *
 * EVERY PROCEDURE CHECKS THE SPONSOR FIRST: the id is client input, and
 * `requireSponsor` proves it names a sponsor of the request's conference
 * before anything about that sponsor is read or written. A foreign id is
 * refused exactly as a missing one.
 *
 * `getAddress` writes nothing, and expires the cached links only when they
 * turn out not to hold the link it is answering.
 *
 * THE CACHED LINKS ARE EXPIRED WHENEVER A WRITE MAY HAVE LANDED, also when
 * the procedure then fails: a commit can land and still throw, and a revoke
 * can clear some versions and fail on the published document.
 */

/**
 * The id names the PUBLISHED sponsor of the request's conference, or the
 * request is refused. Answers the conference.
 *
 * The id of a Studio draft or of a release copy is refused before anything is
 * read: the ownership check would accept it, and every write would then act
 * on that copy alone while the published link stayed as it was.
 */
async function requireSponsor(sponsorForConferenceId: string): Promise<string> {
  if (/^(drafts|versions)\./.test(sponsorForConferenceId)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        'That is an unpublished copy of the sponsor. Open the sponsor from the sponsor list and try again.',
    })
  }
  return requireDocumentInCurrentConference(
    sponsorForConferenceId,
    'sponsorForConference',
  )
}

/**
 * Where this conference's links point: its main host, when that host can sign
 * people in and is still this conference's (`earlyAccessPortalUrl`). A LIVE
 * READ, made only when an address is asked for. Refused, with the reason,
 * when there is none: a link there would open nothing, or open on a host that
 * is no longer this conference's.
 */
async function requirePortalUrl(): Promise<string> {
  const { conference, error } = await getConferenceForCurrentDomain()
  const portalUrl =
    error || !conference ? null : await earlyAccessPortalUrl(conference)
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
  create: workshopAdminProcedure
    .input(SponsorOfConferenceSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await requireSponsor(input.sponsorForConferenceId)
      const portalUrl = await requirePortalUrl()
      let result: Awaited<ReturnType<typeof createEarlyAccessLink>>
      try {
        result = await createEarlyAccessLink(
          conferenceId,
          input.sponsorForConferenceId,
        )
      } finally {
        expireEarlyAccessLinks(conferenceId)
      }
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
      return {
        url: earlyAccessUrl(portalUrl, result.token),
        // Unpublished copies that did not get the token. The link works;
        // publishing one of them would remove it.
        notWritten: result.notWritten,
      }
    }),

  /**
   * The address of the link the sponsor has, for copying. It never creates
   * one, so a copy cannot undo a revoke, and it does not ask about the deal: a
   * link that exists keeps working.
   */
  getAddress: workshopAdminProcedure
    .input(SponsorOfConferenceSchema)
    .query(async ({ input }) => {
      const conferenceId = await requireSponsor(input.sponsorForConferenceId)
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
      // The link is live. If the cached links do not hold it (a create
      // whose expiry did not land), a person opening this address would be
      // told it is no longer valid: make the next read fill them again.
      await expireEarlyAccessLinksIfTheyDisagree(conferenceId, token, {
        live: true,
      })
      return { url: earlyAccessUrl(portalUrl, token) }
    }),

  /**
   * Revoke the sponsor's link. Not gated on the workshop feature: a conference
   * that has turned workshops off can still end its links.
   *
   * `notCleared`: the unpublished copies that still hold the revoked token.
   * The link is not live; publishing one of them would bring it back.
   */
  revoke: adminProcedure
    .input(SponsorOfConferenceSchema)
    .mutation(async ({ input }) => {
      const conferenceId = await requireSponsor(input.sponsorForConferenceId)
      try {
        const { notCleared } = await revokeEarlyAccessLink(
          conferenceId,
          input.sponsorForConferenceId,
        )
        return { success: true as const, notCleared }
      } finally {
        expireEarlyAccessLinks(conferenceId)
      }
    }),
})
