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
  earlyAccessGreeting,
} from '@/lib/sponsor-crm/early-access-email'
import type { PortableTextBlock } from '@portabletext/types'
import type { Conference } from '@/lib/conference/types'
import type { ContactPerson, SponsorEmailTemplate } from '@/lib/sponsor/types'
import { clientReadUncached } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import {
  sendSponsorCommunication,
  type SendSponsorCommunicationResult,
} from '@/lib/sponsor-crm/communication-send'
import {
  COMMUNICATION_KIND_LABELS,
  defaultRecipientKey,
} from '@/lib/sponsor-crm/communication'
import type { ConferenceTheme } from '@/lib/branding/theme'
import {
  createEarlyAccessLink,
  decideEarlyAccessSend,
  earlyAccessConferenceRefusal,
  earlyAccessPortalUrl,
  earlyAccessUrl,
  expireEarlyAccessLinks,
  expireEarlyAccessLinksIfTheyDisagree,
  readEarlyAccessToken,
  revokeEarlyAccessLink,
  type EarlyAccessSendConference,
  type EarlyAccessSendDecision,
  type EarlyAccessSendRefusal,
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
  /** A send of the link: the deal must still be won, link or no link. */
  { forSend = false }: { forSend?: boolean } = {},
): Promise<{ token: string; notWritten: string[] }> {
  let result: Awaited<ReturnType<typeof createEarlyAccessLink>>
  try {
    result = await createEarlyAccessLink(conferenceId, sponsorForConferenceId, {
      wonOnly: forSend,
    })
  } finally {
    expireEarlyAccessLinks(conferenceId)
  }
  if ('refused' in result) {
    throw result.refused === 'not-won'
      ? new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: forSend
            ? sendRefusal('not-won').message
            : 'An early-access link can only be created for a sponsor with a won deal. Move the sponsor to Closed Won first.',
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
 * THE REQUEST'S CONFERENCE, READ WITHOUT A CACHE: where a send of the link
 * takes the registration times from. The read `/admin/workshops` makes, for
 * the same reason: `updateRegistrationTimes` expires the cached conference
 * with a profile that still serves the old answer to the next request.
 *
 * A read that fails is refused: the cached times are not a fallback.
 *
 * THE LIVE CONFERENCE MUST BE THE ONE THE SPONSOR WAS CHECKED AGAINST
 * (`expected`), the rule `/admin/workshops` applies to the same read. Right
 * after a main domain changes hands the live read answers the OTHER
 * conference. Its times say nothing about this sponsor, so the request is
 * refused here, before the window is looked at, in words of its own: the
 * organizer would otherwise be told that conference's "no early-access
 * period". Also what refuses a read that answered no conference at all.
 */
async function readConferenceLive(
  expected: string,
): Promise<EarlyAccessSendConference> {
  const { conference, error } = await getConferenceForCurrentDomain({
    uncached: true,
  })
  if (error) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to fetch conference',
    })
  }
  if (conference?._id !== expected) {
    throw new TRPCError({
      code: 'CONFLICT',
      message:
        'This conference could not be read, so nothing was sent. Reload the page and try again.',
    })
  }
  return conference
}

/**
 * {@link decideEarlyAccessSend} for the request's conference, asked now. A
 * sponsor that is not there is refused as a missing one; every other answer
 * is handed back, for the Send action to refuse with and for the Send modal
 * to show. `conferenceId`: the conference the sponsor was proven to be in.
 */
async function decideSendForRequest(
  conferenceId: string,
  domain: string | undefined,
  sponsorForConferenceId: string,
): Promise<
  | { refusal: ReturnType<typeof sendRefusal>; plan: null }
  | { refusal: null; plan: EarlyAccessSendPlan }
> {
  const decision = await decideEarlyAccessSend({
    readConference: () => readConferenceLive(conferenceId),
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
 * EVERY REFUSAL OF THIS KIND IS MADE HERE, BEFORE ANYTHING IS WRITTEN OR
 * SENT, but one: the deal is asked once more when the link is taken. What is
 * answered is handed to the send primitive as its `appendLate`: it creates
 * the link (or answers the stored one) only once the primitive has accepted
 * the sponsor, the recipients and the message, refuses (and sends nothing)
 * when the deal is no longer won, and builds the block and the listed link
 * from the token that is stored.
 * When the email then fails (no sender, or the provider refuses), the link
 * stays: it is the sponsor's link, the failed send is recorded with it, and
 * the next send reuses it.
 */
export async function prepareEarlyAccessSend(
  /** The request's conference, as the Send action resolved it. */
  conference: { _id: string; theme?: ConferenceTheme | null },
  domain: string | undefined,
  sponsorForConferenceId: string,
) {
  const { refusal, plan } = await decideSendForRequest(
    conference._id,
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
      // The deal is read again here, as the link is: one lost since the
      // decision above refuses the send.
      const link = await createSponsorEarlyAccessLink(
        conference._id,
        sponsorForConferenceId,
        { forSend: true },
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

/**
 * SEND THE EARLY-ACCESS EMAIL TO ONE SPONSOR: the one path behind the
 * "Workshop early access" kind of `sponsor.crm.sendCommunication` and behind
 * a bulk send (`workshop.admin.sendEarlyAccessBulk`). Refuses as
 * {@link prepareEarlyAccessSend} does, by throwing, before anything is
 * written or sent; otherwise answers the send primitive's result.
 *
 * Unset recipients, subject or message start from what the Send modal starts
 * from: the primary contact, "Workshop early access: <conference>" and the
 * built-in greeting. The caller has proven the sponsor belongs to the
 * request's conference and has asked the workshop gate.
 */
export async function sendEarlyAccess({
  conference,
  domain,
  orgId,
  actorId,
  sponsorForConferenceId,
  recipientKeys,
  subject,
  message,
  template,
  senderNames,
}: {
  conference: Conference
  domain: string | undefined
  orgId: string | null | undefined
  actorId: string | null
  sponsorForConferenceId: string
  recipientKeys?: readonly string[]
  subject?: string
  message?: PortableTextBlock[]
  template?: SponsorEmailTemplate
  senderNames?: readonly (string | undefined)[]
}): Promise<SendSponsorCommunicationResult & { copiesBehind: number }> {
  const earlyAccess = await prepareEarlyAccessSend(
    conference,
    domain,
    sponsorForConferenceId,
  )
  if (!recipientKeys || !message) {
    const sponsor = await scopedFetch<{
      name?: string
      contactPersons?: ContactPerson[]
    } | null>(
      clientReadUncached,
      { conferenceId: conference._id },
      `*[_type == "sponsorForConference" && _id == $id][0]{ "name": sponsor->name, contactPersons }`,
      { id: sponsorForConferenceId },
    )
    const primary = defaultRecipientKey(sponsor?.contactPersons)
    recipientKeys ??= primary ? [primary] : []
    message ??= earlyAccessGreeting(
      sponsor?.name ?? 'your company',
      conference.title,
    ) as unknown as PortableTextBlock[]
  }
  const result = await sendSponsorCommunication({
    conference,
    orgId,
    actorId,
    sponsorForConferenceId,
    kind: 'workshop-early-access',
    recipientKeys,
    subject:
      subject ??
      `${COMMUNICATION_KIND_LABELS['workshop-early-access']}: ${conference.title}`,
    message,
    template,
    senderNames,
    appendLate: earlyAccess.appendLate,
  })
  return { ...result, copiesBehind: earlyAccess.notWritten().length }
}

/** At most this many sponsors are mailed by one bulk call. */
export const BULK_MAX_SENDS = 25
/**
 * No new send is started after this much wall-clock time. The tRPC route sets
 * no `maxDuration`, so a call must finish inside the strictest Vercel default
 * (10 s without fluid compute); one send takes a few seconds at most. A call
 * that stops early says how many are left, and running it again continues.
 */
export const BULK_TIME_BUDGET_MS = 8_000

export interface EarlyAccessBulkResult {
  sent: { id: string; name: string }[]
  skipped: { id: string; name: string; reason: string }[]
  /** Sponsors that were due and not tried: the budget ran out. */
  remaining: number
}

/**
 * THE SPONSORS A BULK SEND IS FOR: the given ids, or every Closed Won sponsor
 * of the conference. A given id outside the conference refuses the whole
 * batch, without saying which (as `assertAllOwned` in `@/lib/sponsor-crm/bulk`).
 * `onlyUnsent` leaves out a sponsor that has a SENT early-access email on its
 * activity timeline: the audit record `sendSponsorCommunication` writes.
 */
export async function earlyAccessBulkTargets(
  conferenceId: string,
  { sponsorIds, onlyUnsent }: { sponsorIds?: string[]; onlyUnsent: boolean },
) {
  sponsorIds?.forEach(refuseUnpublishedCopy)
  const sponsors = await scopedFetch<
    { _id: string; name?: string; status?: string; sent: boolean }[]
  >(
    clientReadUncached,
    { conferenceId },
    `*[_type == "sponsorForConference" && ${
      sponsorIds ? '_id in $ids' : 'status == "closed-won"'
    } && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]{
      _id, "name": sponsor->name, status,
      "sent": count(*[_type == "sponsorActivity" && sponsorForConference._ref == ^._id && sponsorForConference->conference._ref == $conferenceId && communicationKind == "workshop-early-access" && deliveryStatus == "sent"]) > 0
    } | order(lower(name) asc)`,
    { ids: sponsorIds ?? [] },
  )
  if (sponsorIds && sponsors.length !== new Set(sponsorIds).size) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Nothing was sent: ${new Set(sponsorIds).size - sponsors.length} of the chosen sponsors are not in this conference.`,
    })
  }
  return sponsors
    .filter((s) => !(onlyUnsent && s.sent))
    .map((s) => ({
      id: s._id,
      name: s.name ?? 'Unnamed sponsor',
      status: s.status,
    }))
}

/**
 * The refusal that holds for every sponsor of the conference, asked once,
 * before a bulk send: from localhost, no early-access window, the window
 * over, no working portal. `null`: sponsors may be mailed.
 */
export async function earlyAccessBulkRefusal(
  conferenceId: string,
  domain: string | undefined,
): Promise<string | null> {
  const live = await readConferenceLive(conferenceId)
  const refused =
    earlyAccessConferenceRefusal(live, domain, new Date()) ??
    ((await earlyAccessPortalUrl(live)) ? null : 'no-portal')
  return refused && EARLY_ACCESS_SEND_REFUSALS[refused]
}

/**
 * MAIL MANY SPONSORS, ONE AT A TIME, WITHIN A BUDGET ({@link BULK_MAX_SENDS},
 * {@link BULK_TIME_BUDGET_MS}). A conference-level refusal refuses the call;
 * a sponsor's own refusal or failed send is listed and the next one is tried.
 */
export async function sendEarlyAccessBulk({
  conference,
  domain,
  orgId,
  actor,
  sponsorIds,
  onlyUnsent,
}: {
  conference: Conference
  domain: string | undefined
  orgId: string | null | undefined
  actor: { id: string | null; names: readonly (string | undefined)[] }
  sponsorIds?: string[]
  onlyUnsent: boolean
}): Promise<EarlyAccessBulkResult> {
  const targets = await earlyAccessBulkTargets(conference._id, {
    sponsorIds,
    onlyUnsent,
  })
  const refusal = await earlyAccessBulkRefusal(conference._id, domain)
  if (refusal) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: refusal })
  }

  const started = Date.now()
  const out: EarlyAccessBulkResult = { sent: [], skipped: [], remaining: 0 }
  let tried = 0
  for (const { id, name, status } of targets) {
    if (
      tried >= BULK_MAX_SENDS ||
      Date.now() - started >= BULK_TIME_BUDGET_MS
    ) {
      break
    }
    tried++
    if (status !== 'closed-won') {
      out.skipped.push({
        id,
        name,
        reason: EARLY_ACCESS_SEND_REFUSALS['not-won'],
      })
      continue
    }
    try {
      const result = await sendEarlyAccess({
        conference,
        domain,
        orgId,
        actorId: actor.id,
        sponsorForConferenceId: id,
        senderNames: actor.names,
      })
      if (result.ok) out.sent.push({ id, name })
      else
        out.skipped.push({
          id,
          name,
          reason:
            result.reason === 'not-found'
              ? notFoundMessage('sponsorForConference')
              : result.message,
        })
    } catch (error) {
      out.skipped.push({
        id,
        name,
        reason: error instanceof TRPCError ? error.message : 'The send failed.',
      })
      if (!(error instanceof TRPCError)) {
        console.error('[sendEarlyAccessBulk] a send failed:', error)
      }
    }
  }
  out.remaining = targets.length - tried
  return out
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
   * THREE LIVE READS, made here, when a send is being composed, and never
   * by viewing a sponsor's record: the conference's registration times, the
   * sponsor's deal and link, and the portal's working host.
   */
  getSendReadiness: workshopAdminProcedure
    .input(SponsorOfConferenceSchema)
    .query(async ({ input }) => {
      const conferenceId = await requireSponsor(input.sponsorForConferenceId)
      // The host only: the times are read live by the decision.
      const { domain } = await getConferenceForCurrentDomain()
      const { refusal, plan } = await decideSendForRequest(
        conferenceId,
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
