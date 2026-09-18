import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { revalidateTag } from 'next/cache'
import { conferenceTag } from '@/lib/cache/tags'
import {
  redatePlanForConference,
  redateWarnings,
} from '@/lib/marketing/redate-run'
import {
  router,
  adminProcedure,
  requireFeatureNotDenied,
  resolveConferenceId,
} from '../trpc'
import {
  TicketSettingsUpdateSchema,
  CreateDiscountCodeSchema,
  GetDiscountsSchema,
  DeleteDiscountCodeSchema,
  GetPaymentDetailsSchema,
  UpdateTicketPageContentSchema,
  UpdateTicketCapacitySchema,
  UpdateTicketTargetsSchema,
  ToggleTargetTrackingSchema,
  SetTicketTypeRoleSchema,
  SetWorkshopAccessSchema,
} from '../schemas/tickets'
import { clientWrite } from '@/lib/sanity/client'
import { generateKey } from '@/lib/sanity/helpers'
import { typeKey } from '@/lib/tickets/classification'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import {
  fetchEventTicketCandidates,
  fetchRedeemedSpeakerEmails,
  searchTicketCandidates,
  joinSpeakerTicketStatus,
} from '@/lib/tickets/speakerStatus'
import { fetchSpeakerTicketInputs } from '@/lib/speaker/ticketInputs'
import { calculateDiscountUsage, sponsorOwningCode } from '@/lib/discounts'
import {
  getTicketingProvider,
  resolveTicketingCredentials,
  type TicketingProvider,
} from '@/lib/tickets/provider'
import type {
  DiscountUsageStats,
  DiscountUsageStatus,
  EventDiscountWithUsage,
} from '@/lib/discounts/types'

/**
 * This request's ticketing context: a Checkin client, plus the ORGANIZATION
 * whose account that client is authenticated against.
 *
 * `orgId` is not decoration. Checkin `customerId` / `eventId` are numeric ids
 * scoped to ONE account, so they are only unique WITHIN an account — two orgs
 * with their own Checkin accounts can legitimately hold the same pair. Anything
 * keyed on those ids alone (a cache, a memo, a lock) therefore needs the account
 * as part of its key or it will serve one org's data to another. `orgId` is the
 * discriminator to use: it identifies the account 1:1 through
 * `resolveTicketingCredentials`, and unlike the API key it is not a secret, so
 * it is safe in a cache key that may reach a log or a key dump.
 */
interface RequestTicketing {
  /** The owning organization — the ACCOUNT discriminator for any cache key. */
  orgId: string
  provider: TicketingProvider
}

/**
 * The Checkin client for THIS request's conference, credentialed through the
 * per-org seam (`resolveTicketingCredentials`) rather than straight off the
 * platform env.
 *
 * WHY IT MOVED. This router used to build ONE process-wide client from
 * `platformCheckinCredentials()`, which bypassed the org-keyed credential
 * resolution every other ticketing surface goes through — so a tenant with its
 * own provisioned Checkin account was served the platform's account here, and a
 * tenant with no account at all was served it too. Resolution is now keyed on
 * the request conference's owning organization, and a tenant the seam declines
 * to credential is REFUSED instead of borrowing the platform's.
 *
 * The provider is pinned to `'checkin'` on purpose: every procedure below speaks
 * Checkin customer/event ids. A Tito-bound conference has no `checkinEventId`
 * and is already refused by `requireCheckinEventId`.
 *
 * COST: `getConferenceForCurrentDomain` is a `'use cache'` read and
 * `resolveTicketingCredentials` is pure env, so calling this twice in one
 * request costs no extra Sanity round-trip. Procedures that need it more than
 * once still hoist it to one local — one resolution per request reads better and
 * keeps `orgId` in scope for the cache key.
 *
 * FAILS CLOSED: an unresolvable conference, a conference with no owning
 * organization, or an org the seam has no credentials for throws BAD_REQUEST.
 */
async function checkin(): Promise<RequestTicketing> {
  const { conference, error } = await getConferenceForCurrentDomain()
  if (error || !conference?._id) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Conference checkin configuration not found',
    })
  }
  const orgId = conference.organization?._ref
  if (!orgId) {
    // No owner means no account to resolve and no discriminator to key on.
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Conference checkin configuration not found',
    })
  }
  const credentials = await resolveTicketingCredentials(orgId, 'checkin')
  if (!credentials) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Ticketing is not configured for this organization',
    })
  }
  return { orgId, provider: getTicketingProvider('checkin', credentials) }
}

/**
 * TENANCY FOR PROVIDER IDS (#730). Even with per-org credentials, a Checkin
 * `eventId` taken from client input addressed any event the resolved account can
 * reach — minting 100%-off codes on, or deleting codes from, another tenant's
 * paid ticket sale whenever two tenants share an account (as every tenant did
 * before the credential seam above). These are provider ids, not Sanity ids, so
 * the document guards cannot see them: the event id is therefore DERIVED from
 * the request's own conference, and a client-supplied one is accepted only when
 * it matches.
 *
 * FAILS CLOSED: an unresolvable conference or a conference with no
 * `checkinEventId` refuses.
 */
async function requireCheckinEventId(clientEventId?: number): Promise<number> {
  const { conference, error } = await getConferenceForCurrentDomain()
  if (error || !conference?.checkinEventId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Conference checkin configuration not found',
    })
  }
  const eventId = conference.checkinEventId
  if (clientEventId !== undefined && clientEventId !== eventId) {
    // NOT_FOUND, not FORBIDDEN: the caller is not entitled to learn that another
    // tenant's event id exists.
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'No ticket event with that id for this conference',
    })
  }
  return eventId
}

/**
 * SHORT-TTL MEMO OF ONE EVENT'S ORDER-ID SET (#731 N1).
 *
 * `fetchEventTickets` is `fetchEventTicketsRaw` PLUS a `while (hasMore)`
 * pagination loop at 1000 orders per batch, so an uncached ownership check costs
 * 1 + ⌈orders/1000⌉ upstream GraphQL calls returning the entire attendee list.
 * Every organizer sharing one provider account could loop the payment-details
 * endpoint and throttle ticketing for all of them. That amplification is new in
 * this PR, because the guard is.
 *
 * The memo holds the in-flight PROMISE, so concurrent callers share one
 * enumeration and a burst of misses costs one round-trip rather than one each.
 * Rejections are evicted immediately: a failed read must not be cached into a
 * refusal, and the caller fails closed on it anyway.
 *
 * THE KEY IS ACCOUNT-SCOPED (`orgId:customerId:eventId`). Checkin
 * `customerId`/`eventId` are numeric ids unique only WITHIN one Checkin account,
 * so two orgs holding their own accounts can legitimately carry the same pair.
 * Keyed on the ids alone, the second org would be served the first org's cached
 * order-id set — the same cross-tenant read this router's credential seam
 * closes, defeated one layer up in a process-global `Map`. Unreachable while the
 * platform org is the only credentialed tenant, but reachable the moment a
 * second org is provisioned, which is the state this work builds toward.
 *
 * `orgId` — NOT the API key — is the discriminator: it maps 1:1 to the account
 * through `resolveTicketingCredentials` and is not a secret, so it is safe in a
 * key that can surface in a log or a heap dump.
 *
 * The TTL is deliberately short. It is a rate limiter, not a data cache — an
 * order created within the window is refused until it expires, which is a modal
 * that needs one reopen, against an availability risk for every tenant.
 */
const ORDER_IDS_TTL_MS = 30_000
const orderIdsCache = new Map<
  string,
  { expiresAt: number; orderIds: Promise<Set<number>> }
>()

function orderIdsForEvent(
  ticketing: RequestTicketing,
  customerId: number,
  eventId: number,
): Promise<Set<number>> {
  const key = `${ticketing.orgId}:${customerId}:${eventId}`
  const now = Date.now()
  const cached = orderIdsCache.get(key)
  if (cached && cached.expiresAt > now) return cached.orderIds

  const orderIds = ticketing.provider
    .fetchEventTickets({ customerId, eventId })
    .then((tickets) => new Set(tickets.map((ticket) => ticket.order_id)))
  orderIds.catch(() => orderIdsCache.delete(key))
  orderIdsCache.set(key, { expiresAt: now + ORDER_IDS_TTL_MS, orderIds })
  // Keep a long-lived warm instance from growing a map entry per event forever.
  for (const [k, entry] of orderIdsCache) {
    if (entry.expiresAt <= now) orderIdsCache.delete(k)
  }
  return orderIds
}

/** Test seam: drop the memo so a case cannot inherit another's enumeration. */
export function __resetOrderIdCache() {
  orderIdsCache.clear()
}

/**
 * The same posture for an `orderId`: prove the order is one of THIS
 * conference's event's orders before reading its payment/customer details.
 */
async function requireOrderInCurrentEvent(
  ticketing: RequestTicketing,
  orderId: number,
): Promise<void> {
  const { conference, error } = await getConferenceForCurrentDomain()
  if (error || !conference?.checkinEventId || !conference?.checkinCustomerId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Conference checkin configuration not found',
    })
  }
  let orderIds: Set<number>
  try {
    orderIds = await orderIdsForEvent(
      ticketing,
      conference.checkinCustomerId,
      conference.checkinEventId,
    )
  } catch (cause) {
    // FAIL CLOSED: an unreadable ticket list authorizes nothing.
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'No order with that id for this conference',
      cause,
    })
  }
  if (!orderIds.has(orderId)) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'No order with that id for this conference',
    })
  }
}

async function updateTicketCapacity(conferenceId: string, capacity: number) {
  try {
    const result = await clientWrite
      .patch(conferenceId)
      .set({ ticketCapacity: capacity })
      .commit()

    return result
  } catch (error) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to update ticket capacity',
      cause: error,
    })
  }
}

async function updateTicketTargets(
  conferenceId: string,
  targets: {
    enabled: boolean
    salesStartDate: string
    targetCurve: 'linear' | 'early_push' | 'late_push' | 's_curve'
    milestones: Array<{
      date: string
      targetPercentage: number
      label: string
    }>
  },
) {
  try {
    const result = await clientWrite
      .patch(conferenceId)
      .set({ ticketTargets: targets })
      .commit()

    return result
  } catch (error) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to update ticket targets',
      cause: error,
    })
  }
}

/**
 * Declare what one or more ticket types ARE, on `conference.ticketTypeRoles`:
 * whether each seats a human (`admits`) and whether it grants workshop access
 * (`grantsWorkshop`). A field left `undefined` in an update is CARRIED FORWARD
 * from the document, never dropped — the two fields are written by two separate
 * controls and each must survive the other being saved.
 *
 * ONE PATCH FOR THE WHOLE BATCH, because the carry-over offered by the workshop
 * control (`WorkshopAccessControl`) is only safe if it is all-or-nothing: the
 * first `grantsWorkshop: true` at a conference switches the legacy bridge off
 * for every type at once (`@/lib/workshop/eligibility`), so declaring one type
 * while failing to declare the others it was meant to carry would revoke
 * /workshop for their holders. Sanity commits one patch atomically.
 *
 * MERGES, NEVER REPLACES. A read-modify-write of the whole array would let two
 * organizers confirming two different types in the same minute clobber each
 * other's entry. Sanity applies a patch's operations in a fixed order —
 * `setIfMissing`, then `unset`, then `insert` — so this one patch removes only
 * the named types' existing entries and appends the new ones, atomically,
 * without ever reading the rest of the list.
 *
 * ESCAPED, because `typeName` reaches a patch PATH rather than a parameter:
 * `JSON.stringify` produces exactly a GROQ string literal (same quoting and
 * escapes), so a name containing a quote or a bracket cannot widen the filter.
 * The schema bounds its length for the same reason.
 *
 * THE MATCH IS CASE-INSENSITIVE, the way the rest of the contract matches
 * (`typeKey`: trim + lowercase, as `classifyTicket` and `workshopAccessOf`
 * read it). A Sanity patch PATH is not a GROQ query — it takes a plain
 * `[field == "literal"]` filter and cannot call `lower()` — so the fold
 * happens in this process instead: the read pulls the WHOLE array and the
 * unset paths are built from the exact spellings actually stored, one per
 * case variant, so a Studio entry spelled `speaker ticket` is replaced by a
 * vendor write of `Speaker ticket` rather than left behind as a duplicate for
 * `classifyTicket` to pick between. The update's own spelling is unset too, so
 * the write is idempotent against an array this read could not see.
 */
async function setTicketTypeRoles(
  conferenceId: string,
  updates: ReadonlyArray<{
    typeName: string
    admits?: boolean
    grantsWorkshop?: boolean
  }>,
) {
  // PRESERVE THE FIELD THIS CALL IS NOT CHANGING. Each write replaces a whole
  // entry, so a bare `{ typeName, admits }` would silently drop the
  // workshop-access flag (`@/lib/workshop/eligibility`) every time an organizer
  // flipped the unrelated seats-an-attendee toggle — revoking /workshop for
  // everyone holding that type — and the mirror image is just as bad: the
  // workshop control must not fabricate a seating declaration.
  //
  // REVISION-CONDITIONED, because preserving a field by reading it is a
  // read-modify-write no matter how narrow the read is: a Studio edit landing
  // between the read and the patch would be overwritten by the stale value,
  // silently revoking or restoring workshop access. The patch shape is atomic
  // for OTHER entries; it does nothing for the field it is carrying forward.
  // `ifRevisionId` makes the read binding — the patch applies only to the
  // document revision it was computed from.
  //
  // RETRY ONCE, then surface a CONFLICT. The operation is idempotent and the
  // re-read picks up the winner's `grantsWorkshop`, so one retry absorbs the
  // ordinary case (an organizer and a Studio edit in the same second) without
  // an unbounded loop; a document under sustained churn tells the organizer to
  // reload rather than quietly writing a guess.
  let lastError: unknown
  const wantedKeys = new Set(updates.map((u) => typeKey(u.typeName)))
  for (let attempt = 0; attempt < 2; attempt++) {
    let existing: {
      _rev?: string
      roles?: { typeName: string; admits?: boolean; grantsWorkshop?: boolean }[]
    } | null
    try {
      existing = await clientWrite.fetch<{
        _rev?: string
        roles?: {
          typeName: string
          admits?: boolean
          grantsWorkshop?: boolean
        }[]
      } | null>(
        // groq-global-scoped: `conferenceId` is `resolveConferenceId()`'s —
        // derived from the request domain and already matched against the
        // caller's org by the `ticketingAdminProcedure` waist. It is the SAME
        // id this function then patches, so a read it could not reach is a
        // document it could not write either.
        //
        // `_rev` comes from the SAME read as the field, so the two cannot
        // describe different states of the document.
        //
        // UNFILTERED, because the filter would have to fold case AND trim to
        // agree with `typeKey`, and neither a patch path nor a GROQ `lower()`
        // does both. The array holds one entry per ticket type at one
        // conference; folding it here is cheaper than getting it subtly wrong.
        `*[_id == $conferenceId][0]{ _rev, "roles": ticketTypeRoles[]{ typeName, admits, grantsWorkshop } }`,
        { conferenceId },
      )
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to save the ticket type role',
        cause: error,
      })
    }

    // No revision means no document, or a read that cannot be conditioned on.
    // Writing unconditionally here would reopen exactly the hole above, so
    // refuse instead (same call as `organizerInvite.revoke`).
    if (!existing?._rev) {
      throw new TRPCError({
        code: 'CONFLICT',
        message:
          'This conference could not be read cleanly. Reload the page and try again.',
      })
    }

    const priorOf = (typeName: string) =>
      existing.roles?.find(
        (role) => typeKey(role.typeName) === typeKey(typeName),
      )

    // Every spelling that has to go: the one being written, plus every stored
    // entry that `typeKey` calls the same type. Without the stored spellings a
    // case variant survives the unset, the insert appends a second entry, and
    // `classifyTicket` / `workshopAccessOf` read whichever comes first — the
    // organizer's toggle appears to save while the old answer keeps applying.
    const unsetNames = new Set(updates.map((u) => u.typeName))
    for (const role of existing.roles ?? []) {
      if (typeof role.typeName !== 'string') continue
      if (wantedKeys.has(typeKey(role.typeName))) unsetNames.add(role.typeName)
    }

    try {
      return await clientWrite
        .patch(conferenceId)
        .ifRevisionId(existing._rev)
        .setIfMissing({ ticketTypeRoles: [] })
        .unset(
          [...unsetNames].map(
            (name) => `ticketTypeRoles[typeName == ${JSON.stringify(name)}]`,
          ),
        )
        .insert(
          'after',
          'ticketTypeRoles[-1]',
          updates.map((u) => {
            const prior = priorOf(u.typeName)
            const admits = u.admits ?? prior?.admits
            const grantsWorkshop = u.grantsWorkshop ?? prior?.grantsWorkshop
            return {
              _key: generateKey('role'),
              typeName: u.typeName,
              // Absent stays ABSENT. Defaulting either field would turn a
              // question nobody answered into a declaration — the count would
              // then report itself as blessed by a human who never saw it.
              ...(typeof admits === 'boolean' && { admits }),
              ...(typeof grantsWorkshop === 'boolean' && { grantsWorkshop }),
            }
          }),
        )
        .commit()
    } catch (error) {
      lastError = error
    }
  }

  console.error('setTicketTypeRoles: conditional patch lost twice:', lastError)
  throw new TRPCError({
    code: 'CONFLICT',
    message:
      'This ticket type changed while you were saving it. Reload the page and try again.',
  })
}

async function getTicketSettings(conferenceId: string) {
  try {
    const query = `*[_type == "conference" && _id == $conferenceId][0]{
      _id,
      ticketCapacity,
      ticketTargets
    }`

    const conference = await clientWrite.fetch(query, { conferenceId })

    if (!conference) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Conference not found',
      })
    }

    return conference
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error
    }
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to fetch ticket settings',
      cause: error,
    })
  }
}

/**
 * THE ORGANIZER-FACING TICKETING API, behind the kill switch (#836).
 *
 * Every procedure in `tickets.admin.*` is an ORGANIZER-VISIBLE OUTPUT of the
 * ticketing feature, so an operator's `enabled: false` override must reach all
 * of them and not merely the pages #834 gated. Before this, an authenticated
 * organizer of a switched-off org could still call the router directly — and
 * `createDiscountCode` / `deleteDiscountCode` still WROTE to that tenant's own
 * provider account. The platform is deliberately agent-facing (`konfctl`, an
 * MCP server), so "only reachable through the API" describes a growing surface.
 *
 * IT IS ONE PROCEDURE, NOT A CHECK PER ENDPOINT, on purpose: the sub-router is
 * ticketing in its entirety (13 procedures today), so the fourteenth inherits
 * the gate by being declared here rather than by somebody remembering to add a
 * line to it.
 *
 * SCOPE, SAID EXACTLY. This refuses only on an ACTIVE explicit deny (see
 * `requireFeatureNotDenied`); an org that was never granted ticketing but has
 * its own credentials keeps working, which is the invariant
 * `@/lib/features/ticketing` rule 2 protects.
 *
 * TWO PROCEDURES OUTSIDE THIS SUB-ROUTER compose the same middleware
 * individually, because they are ticketing surfaces that live elsewhere:
 * `conference.updateTicketingIds` and `sponsor.crm.sendDiscountEmail` (#850).
 * Everything else stays ungated: the ATTENDEE-facing ticket sale and workshop
 * eligibility (a deny must not break a sale mid-conference), the budget
 * router's ticket-config mutations, the admin status PROBES, and
 * speaker-ticket issuance — which therefore still writes a 100%-off discount
 * into a denied org's vendor account (borderline, low-harm, left knowingly).
 */
const ticketingAdminProcedure = adminProcedure.use(
  requireFeatureNotDenied('ticketing'),
)

export const ticketsRouter = router({
  admin: router({
    /**
     * Per-speaker: have they actually CLAIMED their complimentary ticket?
     *
     * ONE full-event provider fetch per invocation (memoized 30s in
     * `fetchRedeemedSpeakerEmails`), joined in memory against the conference's
     * accepted/confirmed talks — never a fetch per speaker.
     *
     * DEGRADES TO `unknown`: an unconfigured, uncredentialed or failing
     * provider — or one that cannot send invitations, or an event with no
     * identifiable speaker ticket type — yields `unknown` for everyone rather
     * than reporting the whole programme as unredeemed.
     *
     * PII: returns the state and the invitation timestamp only. `EventTicket`
     * carries names, sums, payment state and order ids, and this payload feeds
     * a client component.
     */
    speakerTicketStatus: ticketingAdminProcedure.query(async () => {
      const { conference, error } = await getConferenceForCurrentDomain()
      if (error || !conference?._id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Conference not found',
        })
      }

      // The Sanity half lives in `@/lib/speaker/ticketInputs` — `/admin/tickets`
      // needs the same per-speaker aggregation for its free-ticket table.
      const inputs = await fetchSpeakerTicketInputs(conference._id)
      if (!inputs) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Unable to read speaker ticket invitations',
        })
      }

      const redeemed = await fetchRedeemedSpeakerEmails(conference)
      return { statuses: joinSpeakerTicketStatus(inputs, redeemed) }
    }),

    /**
     * Search THIS event's tickets by name or address, for an organizer who is
     * trying to find the ticket a speaker bought under an address we do not
     * hold.
     *
     * NO FETCH OF ITS OWN: it filters the same 30s-memoized full-event read the
     * claim-status join uses (`fetchEventTicketCandidates`), so typing in the
     * search box cannot put the provider under one request per keystroke.
     *
     * PII: name, address and category — nothing else. The narrowing happens in
     * the memo, so the order ids, sums and payment state `EventTicket` carries
     * are not in this process's cached copy, let alone in the payload.
     *
     * `[]` covers both "no match" and "provider unreadable". The organizer's
     * next step is the same either way (nothing to link), and distinguishing
     * them here would only add a state the UI has nothing to say about.
     */
    searchEventTickets: ticketingAdminProcedure
      .input(z.object({ query: z.string().trim().min(2).max(100) }))
      .query(async ({ input }) => {
        const { conference, error } = await getConferenceForCurrentDomain()
        if (error || !conference?._id) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Conference not found',
          })
        }
        const candidates = await fetchEventTicketCandidates(conference)
        // NARROWED AGAIN on the way out: the organizer needs to recognize the
        // ticket, not to receive its id. `ticketId` and `registeredEmail` stay
        // server-side, because the provenance trail is written from the server's
        // own copy of the record rather than from anything the client sends back.
        return {
          tickets: searchTicketCandidates(candidates ?? [], input.query).map(
            ({ name, email, category }) => ({ name, email, category }),
          ),
        }
      }),

    getSettings: ticketingAdminProcedure.query(async () => {
      const conferenceId = await resolveConferenceId()
      return getTicketSettings(conferenceId)
    }),

    updateSettings: ticketingAdminProcedure
      .input(TicketSettingsUpdateSchema)
      .mutation(async ({ input }) => {
        const conferenceId = await resolveConferenceId()
        const { ticketCapacity, ticketTargets } = input

        await getTicketSettings(conferenceId)

        const updates: Record<string, unknown> = {}

        if (ticketCapacity !== undefined) {
          updates.ticketCapacity = ticketCapacity
        }

        if (ticketTargets !== undefined) {
          updates.ticketTargets = ticketTargets
        }

        if (Object.keys(updates).length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'No updates provided',
          })
        }

        try {
          const result = await clientWrite
            .patch(conferenceId)
            .set(updates)
            .commit()

          revalidateTag('admin:tickets', 'default')
          // `ticketCapacity`/`ticketTargets` live on the CONFERENCE document, which
          // the cached conference read serves through its `...` spread.
          // `admin:tickets` never reaches that entry, so the public ticket surfaces
          // kept serving the old numbers until it expired on its own.
          revalidateTag(conferenceTag(conferenceId), 'default')

          const warnings = redateWarnings(
            await redatePlanForConference(conferenceId),
          )
          return {
            success: true,
            updated: result,
            marketingWarnings: warnings,
          }
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update ticket settings',
            cause: error,
          })
        }
      }),

    updateCapacity: ticketingAdminProcedure
      .input(UpdateTicketCapacitySchema)
      .mutation(async ({ input }) => {
        const conferenceId = await resolveConferenceId()
        const { capacity } = input
        const result = await updateTicketCapacity(conferenceId, capacity)

        revalidateTag('admin:tickets', 'default')
        // `ticketCapacity`/`ticketTargets` live on the CONFERENCE document, which
        // the cached conference read serves through its `...` spread.
        // `admin:tickets` never reaches that entry, so the public ticket surfaces
        // kept serving the old numbers until it expired on its own.
        revalidateTag(conferenceTag(conferenceId), 'default')

        return result
      }),

    updateTargets: ticketingAdminProcedure
      .input(UpdateTicketTargetsSchema)
      .mutation(async ({ input }) => {
        const conferenceId = await resolveConferenceId()
        const { targets } = input
        const result = await updateTicketTargets(conferenceId, targets)

        revalidateTag('admin:tickets', 'default')
        // `ticketCapacity`/`ticketTargets` live on the CONFERENCE document, which
        // the cached conference read serves through its `...` spread.
        // `admin:tickets` never reaches that entry, so the public ticket surfaces
        // kept serving the old numbers until it expired on its own.
        revalidateTag(conferenceTag(conferenceId), 'default')

        const warnings = redateWarnings(
          await redatePlanForConference(conferenceId),
        )
        return { ...result, marketingWarnings: warnings }
      }),

    toggleTargetTracking: ticketingAdminProcedure
      .input(ToggleTargetTrackingSchema)
      .mutation(async ({ input }) => {
        const conferenceId = await resolveConferenceId()
        const { enabled } = input

        const conference = await getTicketSettings(conferenceId)
        const currentTargets = conference.ticketTargets || {}

        const updatedTargets = {
          ...currentTargets,
          enabled,
        }

        const result = await updateTicketTargets(conferenceId, updatedTargets)

        revalidateTag('admin:tickets', 'default')
        // `ticketCapacity`/`ticketTargets` live on the CONFERENCE document, which
        // the cached conference read serves through its `...` spread.
        // `admin:tickets` never reaches that entry, so the public ticket surfaces
        // kept serving the old numbers until it expired on its own.
        revalidateTag(conferenceTag(conferenceId), 'default')

        const warnings = redateWarnings(
          await redatePlanForConference(conferenceId),
        )
        return { ...result, marketingWarnings: warnings }
      }),

    /**
     * Confirm (or override) what ONE ticket type is, from /admin/tickets/types.
     *
     * This is the organizer's answer to the question no provider exposes, and
     * it MOVES THE PARTICIPANT COUNT: `classifyTicket` prefers a declaration
     * over the evidence-derived proposal, so an add-on declared here stops
     * being counted as a person in the room.
     *
     * TENANCY: the conference is `resolveConferenceId()`'s — derived from the
     * request domain, never from the payload — exactly like its
     * `ticketCapacity` / `ticketTargets` neighbours, and the org-scoped
     * `adminProcedure` waist has already matched the caller's
     * `organizerOrgIds` against that conference's owning organization. There is
     * no conference id on the input for a cross-tenant write to travel on.
     */
    setTicketTypeRole: ticketingAdminProcedure
      .input(SetTicketTypeRoleSchema)
      .mutation(async ({ input }) => {
        const conferenceId = await resolveConferenceId()
        const result = await setTicketTypeRoles(conferenceId, [
          { typeName: input.typeName, admits: input.admits },
        ])

        revalidateTag('admin:tickets', 'default')
        // `ticketTypeRoles` lives on the CONFERENCE document, which the cached
        // conference read serves through its `...` spread — so the counts that
        // depend on it keep serving the old role until this tag is busted.
        revalidateTag(conferenceTag(conferenceId), 'default')

        return result
      }),

    /**
     * Declare WORKSHOP ACCESS for one or more ticket types, from the same page.
     *
     * A BATCH because of the cliff it exists to survive: until some type
     * declares `grantsWorkshop: true`, `@/lib/workshop/eligibility` decides
     * access from a hardcoded legacy list of type names, and the FIRST
     * declaration anywhere at the conference turns that list off for every
     * type at once. The UI therefore offers to carry the currently-granting
     * types over in the same action, and that offer is only honest if the
     * whole set lands together — one patch, one revision, all or nothing.
     *
     * `admits` is never touched here (and never invented): the seating question
     * belongs to `setTicketTypeRole`, and the entry carries whatever it already
     * said. TENANCY is its neighbour's, unchanged — the conference comes from
     * `resolveConferenceId()`, never from the payload.
     */
    setWorkshopAccess: ticketingAdminProcedure
      .input(SetWorkshopAccessSchema)
      .mutation(async ({ input }) => {
        const conferenceId = await resolveConferenceId()
        const result = await setTicketTypeRoles(conferenceId, input.updates)

        revalidateTag('admin:tickets', 'default')
        // The /workshop gate re-reads this field live, but the cached
        // conference read (and the counts hanging off it) still serves the old
        // roles until this tag is busted.
        revalidateTag(conferenceTag(conferenceId), 'default')

        return result
      }),

    getTicketTypes: ticketingAdminProcedure.query(async () => {
      try {
        const { conference, error: conferenceError } =
          await getConferenceForCurrentDomain()

        if (conferenceError || !conference.checkinEventId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Conference checkin configuration not found',
          })
        }

        const eventId = conference.checkinEventId
        const { provider } = await checkin()
        const eventData = await provider.listDiscounts(eventId)

        return {
          success: true,
          ticketTypes: eventData.ticketTypes,
          count: eventData.ticketTypes.length,
          eventId,
        }
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch ticket types',
          cause: error,
        })
      }
    }),

    getDiscountCodes: ticketingAdminProcedure
      .input(GetDiscountsSchema)
      .query(async ({ input }) => {
        try {
          // OWNERSHIP (#730): the event id comes from THIS conference, never
          // from the payload. Discount codes are redeemable strings.
          const eventId = await requireCheckinEventId(input.eventId)
          const { provider } = await checkin()
          const eventData = await provider.listDiscounts(eventId)
          return {
            success: true,
            discounts: eventData.discounts,
            count: eventData.discounts.length,
          }
        } catch (error) {
          // Preserve the fail-closed refusal instead of masking it as a 500.
          if (error instanceof TRPCError) throw error
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch discount codes',
            cause: error,
          })
        }
      }),

    getDiscountCodesWithUsage: ticketingAdminProcedure.query(async () => {
      try {
        const { conference, error: conferenceError } =
          await getConferenceForCurrentDomain()

        if (
          conferenceError ||
          !conference.checkinCustomerId ||
          !conference.checkinEventId
        ) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Conference checkin configuration not found',
          })
        }

        const customerId = conference.checkinCustomerId
        const eventId = conference.checkinEventId

        // ONE resolution for both provider calls below.
        const { provider } = await checkin()
        const eventData = await provider.listDiscounts(eventId)
        const discounts = eventData.discounts

        // EMPTY IS NOT UNKNOWN. `calculateDiscountUsage` only mints a key for a
        // code somebody actually redeemed, so a conference with live codes and
        // no redemptions yields `{}` — identical to what the catch below leaves
        // behind when the ticket read throws. The old `hasUsageData:
        // Object.keys(usageStats).length > 0` therefore reported "usage data
        // unavailable" over data that was available and simply zero. The status
        // records WHICH of the two happened; nothing else can tell them apart.
        let usageStats: DiscountUsageStats = {}
        let usageStatus: DiscountUsageStatus = 'resolved'
        let totalTickets: number | null = null

        try {
          const tickets = await provider.fetchEventTickets({
            customerId,
            eventId,
          })
          usageStats = calculateDiscountUsage(tickets)
          totalTickets = tickets.length
        } catch (ticketsError) {
          usageStatus = 'unavailable'
          console.warn('Could not fetch tickets for usage stats:', ticketsError)
        }

        const discountsWithUsage: EventDiscountWithUsage[] = discounts.map(
          (discount) => ({
            ...discount,
            // On `unavailable` the field is OMITTED rather than zero-filled: a
            // zero here would be the server asserting nobody redeemed a code it
            // never managed to check. Its absence is the client's cue to fall
            // back to the provider's own `times` counter and say so.
            ...(usageStatus === 'resolved'
              ? {
                  actualUsage: usageStats[
                    discount.triggerValue?.toUpperCase() || ''
                  ] || {
                    usageCount: 0,
                    ticketIds: [],
                    totalPaid: 0,
                  },
                }
              : {}),
          }),
        )

        return {
          success: true,
          discounts: discountsWithUsage,
          ticketTypes: eventData.ticketTypes,
          // `usageStats` DELIBERATELY NOT RETURNED — because it is AMBIGUOUS,
          // not merely because it is unread. It was the raw map, and on an
          // unavailable read it ships as `{}`, byte-identical to a resolved
          // read with no redemptions: the very ambiguity this endpoint now
          // exists to remove, preserved in a sibling field of the same payload.
          // Every number in it is already on `discounts[].actualUsage`, where
          // absence carries the meaning. (That no consumer read it is what made
          // deleting it SAFE — several fields below are equally unread and stay,
          // because none of them misstates anything.)
          //
          // `null`, not 0, when the read failed — we did not count zero
          // tickets, we failed to count any.
          totalTickets,
          count: discounts.length,
          usageStatus,
          conferenceInfo: {
            customerId: conference.checkinCustomerId,
            eventId: conference.checkinEventId,
            title: conference.title,
          },
        }
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch discount codes with usage',
          cause: error,
        })
      }
    }),

    createDiscountCode: ticketingAdminProcedure
      .input(CreateDiscountCodeSchema)
      .mutation(async ({ input }) => {
        const {
          discountCode,
          numberOfTickets,
          sponsorName,
          tierTitle,
          discountPercentage,
          selectedTicketTypes,
        } = input

        try {
          // OWNERSHIP (#730): this endpoint mints discount codes — up to 100%
          // off — so an unvalidated `eventId` wrote them onto ANOTHER tenant's
          // paid ticket sale against the shared platform credential.
          const eventId = await requireCheckinEventId(input.eventId)

          // A STANDALONE code may not collide with a sponsor's namespace.
          //
          // The panel attributes a code to a sponsor by SUBSTRING
          // (`sponsorOwningCode`), so a community code like `PARTNER-NDC` does
          // not merely display under sponsor "NDC" — it takes that sponsor's
          // row over: the row reports the standalone code's redemptions as the
          // sponsor's entitlement usage, stops offering to create the real
          // 100% comp, and points "send email" and "delete code" at the wrong
          // code. Refusing the name is the cheap half of the fix; the
          // expensive half would be persisting a real sponsor↔code link, which
          // the provider cannot hold.
          //
          // Guarded HERE, not only in the form: the form's warning is an
          // affordance, this is the boundary. Sponsor codes are exempt because
          // containing the sponsor's name is exactly what they are for.
          if (!sponsorName) {
            const { conference, error: sponsorsError } =
              await getConferenceForCurrentDomain({ sponsors: true })
            // FAILS CLOSED. That read swallows a failure into `error` and
            // returns a conference with NO `sponsors`, so treating the absent
            // list as "no sponsors" would turn a transient Sanity problem into
            // a silently accepted colliding code — a guard degrading into the
            // thing it exists to refuse. Refuse the write instead; the
            // organizer can retry.
            if (sponsorsError || !conference) {
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message:
                  'Could not read this conference’s sponsors, so a code cannot be checked against them. Try again.',
                cause: sponsorsError,
              })
            }
            const claimed = sponsorOwningCode(
              discountCode,
              conference.sponsors?.map((s) => s.sponsor.name) ?? [],
            )
            if (claimed) {
              throw new TRPCError({
                code: 'CONFLICT',
                message: `"${discountCode}" contains the sponsor name "${claimed}", so it would be counted against that sponsor's tickets. Choose a code that does not contain a sponsor's name.`,
              })
            }
          }

          // ONE resolution for the existence check and the create below.
          const { provider } = await checkin()
          const eventData = await provider.listDiscounts(eventId)
          const codeExists = eventData.discounts.some(
            (discount) => discount.triggerValue === discountCode,
          )

          if (codeExists) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: `Discount code "${discountCode}" already exists`,
            })
          }

          const result = await provider.createDiscount({
            eventId,
            discountCode,
            numberOfTickets,
            ticketTypes: selectedTicketTypes || [],
            discountType: 'percentage',
            discountValue: discountPercentage,
          })

          revalidateTag('admin:tickets', 'default')

          // ONE message for both kinds. A sponsor code still reads exactly as
          // it did — `sponsorName` absent simply drops the "for …" clause, and
          // the percentage clause only appears when it is not the 100% every
          // code used to be.
          const issuedTo = sponsorName
            ? ` for ${sponsorName}${tierTitle ? ` (${tierTitle} tier)` : ''}`
            : ''
          const rate =
            discountPercentage === 100 ? '' : ` at ${discountPercentage}% off`

          return {
            success: true,
            discountCode,
            result,
            message: `Created discount code "${discountCode}"${issuedTo} with ${numberOfTickets} tickets${rate}`,
          }
        } catch (error) {
          if (error instanceof TRPCError) {
            throw error
          }
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message:
              error instanceof Error
                ? error.message
                : 'Failed to create discount code',
            cause: error,
          })
        }
      }),

    deleteDiscountCode: ticketingAdminProcedure
      .input(DeleteDiscountCodeSchema)
      .mutation(async ({ input }) => {
        try {
          // OWNERSHIP (#730): unvalidated, this deleted another tenant's live
          // sponsor/partner discount codes.
          const eventId = await requireCheckinEventId(input.eventId)
          const { provider } = await checkin()
          const success = await provider.deleteDiscount(
            eventId,
            input.discountCode,
          )

          if (!success) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to delete discount code',
            })
          }

          return { success: true }
        } catch (error) {
          console.error('Error deleting discount code:', error)

          if (error instanceof TRPCError) {
            throw error
          }

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message:
              error instanceof Error
                ? error.message
                : 'Failed to delete discount code',
          })
        }
      }),

    getPaymentDetails: ticketingAdminProcedure
      .input(GetPaymentDetailsSchema)
      .query(async ({ input }) => {
        const { orderId } = input

        try {
          // OWNERSHIP (#730): `orderId` is a small enumerable integer against a
          // credential shared by every tenant — unvalidated, this read another
          // tenant's customer's payment and order details.
          // ONE resolution: the ownership enumeration and the read that
          // follows MUST run against the SAME account, or the guard proves
          // nothing about the order it just admitted.
          const ticketing = await checkin()
          await requireOrderInCurrentEvent(ticketing, orderId)
          const paymentDetails =
            await ticketing.provider.fetchOrderPaymentDetails(orderId)
          return {
            success: true,
            paymentDetails,
          }
        } catch (error) {
          // Preserve the fail-closed refusal instead of masking it as a 500.
          if (error instanceof TRPCError) throw error
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch payment details',
            cause: error,
          })
        }
      }),

    getPageContent: ticketingAdminProcedure.query(async () => {
      const conferenceId = await resolveConferenceId()

      try {
        const query = `*[_type == "conference" && _id == $conferenceId][0]{
          _id,
          ticketCustomization,
          ticketInclusions,
          ticketFaqs,
          vanityMetrics
        }`

        const conference = await clientWrite.fetch(query, { conferenceId })

        if (!conference) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Conference not found',
          })
        }

        return conference
      } catch (error) {
        if (error instanceof TRPCError) throw error
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch ticket page content',
          cause: error,
        })
      }
    }),

    updatePageContent: ticketingAdminProcedure
      .input(UpdateTicketPageContentSchema)
      .mutation(async ({ input }) => {
        const conferenceId = await resolveConferenceId()
        const { ticketCustomization, ticketInclusions, ticketFaqs } = input

        const updates: Record<string, unknown> = {}

        if (ticketCustomization !== undefined) {
          updates.ticketCustomization = ticketCustomization
        }

        if (ticketInclusions !== undefined) {
          updates.ticketInclusions = ticketInclusions
        }

        if (ticketFaqs !== undefined) {
          updates.ticketFaqs = ticketFaqs
        }

        if (Object.keys(updates).length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'No updates provided',
          })
        }

        try {
          const result = await clientWrite
            .patch(conferenceId)
            .set(updates)
            .commit()

          // Ticket page content belongs to one conference — bust only this tenant.
          revalidateTag(conferenceTag(conferenceId), 'default')

          return {
            success: true,
            updated: result,
          }
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update ticket page content',
            cause: error,
          })
        }
      }),
  }),
})
