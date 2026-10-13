import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { adminProcedure, router } from '../trpc'
import { workshopAdminProcedure } from '../workshopAdmin'
// One sponsor by `sponsorForConferenceId`: the schema the discount-code picker
// defined first, under the name of what it was first used for.
import { SponsorDiscountCodeOptionsSchema as SponsorOfConferenceSchema } from '../schemas/sponsorForConference'
import { notFoundMessage, requireDocumentInCurrentConference } from '../tenancy'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import {
  EARLY_ACCESS_SEND_REFUSALS,
  earlyAccessAttachments,
  earlyAccessCardHtml,
  type EarlyAccessSendRefusal,
} from '@/lib/sponsor-crm/early-access-email'
import type { ConferenceTheme } from '@/lib/branding/theme'
import {
  createEarlyAccessLink,
  decideEarlyAccessSend,
  earlyAccessPortalUrl,
  earlyAccessUrl,
  expireEarlyAccessLinks,
  expireEarlyAccessLinksIfTheyDisagree,
  readEarlyAccessToken,
  revokeEarlyAccessLink,
  type EarlyAccessSendDecision,
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
  refuseUnpublishedCopy(sponsorForConferenceId)
  return requireDocumentInCurrentConference(
    sponsorForConferenceId,
    'sponsorForConference',
  )
}

/**
 * The first half of {@link requireSponsor}, which reads nothing: also asked
 * by the Send action before its own ownership check, when it sends the link
 * (#1347).
 */
export function refuseUnpublishedCopy(sponsorForConferenceId: string): void {
  if (/^(drafts|versions)\./.test(sponsorForConferenceId)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        'That is an unpublished copy of the sponsor. Open the sponsor from the sponsor list and try again.',
    })
  }
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
      message: EARLY_ACCESS_SEND_REFUSALS['no-portal'],
    })
  }
  return portalUrl
}

/**
 * CREATE THE SPONSOR'S LINK, OR ANSWER THE ONE IT HAS: the one function behind
 * the record's "Create link" and behind a send of the link (#1347), so both
 * store a token under the same rule and neither can leave the cached links
 * stale. The caller has proven the sponsor belongs to `conferenceId`.
 *
 * The cached links are expired whenever a write may have landed, also when
 * the create then fails, and also when what follows it does (an email the
 * provider refuses): the expiry is made here, before anything follows.
 */
export async function createSponsorEarlyAccessLink(
  conferenceId: string,
  sponsorForConferenceId: string,
): Promise<{ token: string; notWritten: string[] }> {
  let result: Awaited<ReturnType<typeof createEarlyAccessLink>>
  try {
    result = await createEarlyAccessLink(conferenceId, sponsorForConferenceId)
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
  return result
}

/** A send that may go ahead, as {@link decideEarlyAccessSend} answers it. */
type EarlyAccessSendPlan = Extract<EarlyAccessSendDecision, { refused: null }>

/** Why a send is refused, with the words the organizer is told. */
function sendRefusal(reason: EarlyAccessSendRefusal) {
  return { reason, message: EARLY_ACCESS_SEND_REFUSALS[reason] }
}

/**
 * {@link decideEarlyAccessSend} for the request's conference, asked now. A
 * sponsor that is not there is refused as a missing one; every other answer
 * is handed back, for the Send action to refuse with and for the Send modal
 * to show.
 */
async function decideSendForRequest(
  conference: Parameters<typeof decideEarlyAccessSend>[0]['conference'],
  domain: string | undefined,
  sponsorForConferenceId: string,
): Promise<
  | { refusal: ReturnType<typeof sendRefusal>; plan: null }
  | { refusal: null; plan: EarlyAccessSendPlan }
> {
  const decision = await decideEarlyAccessSend({
    conference,
    domain,
    sponsorForConferenceId,
    now: new Date(),
  })
  if (decision.refused === 'not-found') {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: notFoundMessage('sponsorForConference'),
    })
  }
  return decision.refused === null
    ? { refusal: null, plan: decision }
    : { refusal: sendRefusal(decision.refused), plan: null }
}

/**
 * THE "WORKSHOP EARLY ACCESS" KIND of `sponsor.crm.sendCommunication` (#1347):
 * refuse, or answer how the send gets its link.
 *
 * EVERY REFUSAL IS MADE HERE, BEFORE ANYTHING IS WRITTEN OR SENT. What is
 * answered is handed to the send primitive as its `appendLate`: it creates
 * the link (or answers the stored one) only once the primitive has nothing
 * left to refuse, and builds the block and the listed link from the token
 * that is stored. When the email then fails, the link stays: it is the
 * sponsor's link, the record shows it, and the next send reuses it.
 */
export async function prepareEarlyAccessSend(
  conference: Parameters<typeof decideEarlyAccessSend>[0]['conference'] & {
    theme?: ConferenceTheme | null
  },
  domain: string | undefined,
  sponsorForConferenceId: string,
) {
  const { refusal, plan } = await decideSendForRequest(
    conference,
    domain,
    sponsorForConferenceId,
  )
  if (refusal) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: refusal.message,
    })
  }
  let notWritten: string[] = []
  return {
    appendLate: async () => {
      const link = await createSponsorEarlyAccessLink(
        conference._id,
        sponsorForConferenceId,
      )
      notWritten = link.notWritten
      const url = earlyAccessUrl(plan.portalUrl, link.token)
      return {
        html: earlyAccessCardHtml({
          url,
          sponsorStart: plan.sponsorStart,
          officialOpening: plan.officialOpening,
          theme: conference.theme,
        }),
        attachments: earlyAccessAttachments(url),
      }
    },
    /**
     * Unpublished copies of the sponsor that did not get the token, once the
     * link has been created: publishing one of them would remove the link.
     */
    notWritten: () => notWritten,
  }
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
      const result = await createSponsorEarlyAccessLink(
        conferenceId,
        input.sponsorForConferenceId,
      )
      return {
        url: earlyAccessUrl(portalUrl, result.token),
        // Unpublished copies that did not get the token. The link works;
        // publishing one of them would remove it.
        notWritten: result.notWritten,
      }
    }),

  /**
   * MAY THE LINK BE SENT TO THIS SPONSOR NOW? What the Send modal asks when
   * it opens on the "Workshop early access" kind (#1347): the answer the Send
   * action itself would give, from the same decision, so the modal and the
   * server refuse for the same reasons, in the same words.
   *
   * It writes nothing. When the send may go ahead it answers what the preview
   * shows: the two times, and the address of the link the sponsor already
   * has (`null`: sending creates one).
   *
   * Finding the portal's working host is a live read. It is made here, when
   * a send is being composed, and never by viewing a sponsor's record.
   */
  sendReadiness: workshopAdminProcedure
    .input(SponsorOfConferenceSchema)
    .query(async ({ input }) => {
      await requireSponsor(input.sponsorForConferenceId)
      const { conference, domain, error } =
        await getConferenceForCurrentDomain()
      if (error || !conference) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch conference',
        })
      }
      const { refusal, plan } = await decideSendForRequest(
        conference,
        domain,
        input.sponsorForConferenceId,
      )
      return refusal
        ? { refusal }
        : {
            refusal: null,
            url: plan.url,
            sponsorStart: plan.sponsorStart,
            officialOpening: plan.officialOpening,
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
   *
   * `leftCopies`: the `notCleared` of an earlier revoke, handed back so this
   * one can try them again. They are CLIENT INPUT and are trusted for
   * nothing: `revokeEarlyAccessLink` clears a token there only from an
   * unpublished copy of the request's conference that holds a dead one.
   */
  revoke: adminProcedure
    .input(
      SponsorOfConferenceSchema.extend({
        leftCopies: z.array(z.string().min(1).max(200)).max(50).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const conferenceId = await requireSponsor(input.sponsorForConferenceId)
      try {
        const { notCleared } = await revokeEarlyAccessLink(
          conferenceId,
          input.sponsorForConferenceId,
          { leftCopies: input.leftCopies },
        )
        return { success: true as const, notCleared }
      } finally {
        expireEarlyAccessLinks(conferenceId)
      }
    }),
})
