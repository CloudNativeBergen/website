/**
 * Who was given a free ticket, and who actually took it — PER CATEGORY.
 *
 * The old `calculateFreeTicketAllocation` had one allocated number per category
 * and ONE claimed number for the whole event:
 *
 *     totalClaimed = freeTickets.length   // every zero-priced ticket
 *
 * Against real data that is three wrong answers stacked into one. On the tenant
 * this was measured on it rendered "37 / 100 claimed": the 37 was speaker
 * tickets, every one of them, and it was spread across all three rows.
 *
 *  - SPONSOR comps are not zero-priced rows at all. They are minted as a
 *    100%-off DISCOUNT CODE (see `../discounts/attribution`), so a sponsor comp
 *    is a REDEMPTION, and a comp issued inside a paid order can even carry a
 *    nonzero `sum`. The price test finds none of them: 0 of 40 claimed, shown as
 *    part of a number that said otherwise.
 *  - SPEAKER comps are knowable exactly — `./speakerStatus` already separates
 *    redeemed / invited / not-invited / unknown — and the split is the useful
 *    part: 14 confirmed speakers with no ticket is the one number on this page
 *    an organizer can act on, and the old table could not show it.
 *  - ORGANIZER comps are NOT knowable. `./classification` deliberately produces
 *    no `grantedBy: 'organizer'`: in provider data an organizer comp and an
 *    ordinary ticket at a free-to-attend event are the same record. So this
 *    reports `'unknown'` — never 0, which would read as "nine organizers have
 *    not claimed" and send someone chasing them.
 *
 * `'unknown'` follows the `DiscountUsageStatus` vocabulary in
 * `../discounts/types`: a fact we could not obtain is not a zero. It never
 * renders as 0 and never enters a percentage — one unknown row makes the total
 * unknown, because an event-wide rate computed over a row we could not count is
 * a number nobody can act on.
 *
 * Pure: no fetching. `/admin/tickets` assembles the inputs.
 */
import { removesFullPrice } from './classification'
import { ticketEntitlementOf, type TierWithEntitlement } from './entitlement'
import type { SpeakerTicketStatus } from './speakerStatus'
import { sponsorOwningCode } from '@/lib/discounts/attribution'
import { resolveRedemptionCount } from '@/lib/discounts/usage'
import type { EventDiscountWithUsage } from '@/lib/discounts/types'

/** A count we have, or the admission that we do not have one. */
export type FreeTicketCount = number | 'unknown'

export interface FreeAllocationCategory {
  /** Seats this category is entitled to. */
  allocated: FreeTicketCount
  /**
   * Seats actually taken. NOT clamped to `allocated`: a sponsor who redeemed
   * more than their tier includes is exactly what an organizer needs to see.
   */
  claimed: FreeTicketCount
  /**
   * The claimed count came from the PROVIDER'S own redemption counter because
   * we have none of our own — the distinction `resolveRedemptionCount`
   * documents, named on screen the way `DiscountCodeManager` names it.
   */
  fromProvider: boolean
  /** One line saying where the number came from, or why there is none. */
  status: string
}

export interface FreeTicketAllocation {
  sponsors: FreeAllocationCategory
  speakers: FreeAllocationCategory
  organizers: FreeAllocationCategory
  totalAllocated: FreeTicketCount
  totalClaimed: FreeTicketCount
}

export interface FreeTicketAllocationInput {
  /** This conference's sponsors, for entitlement and code attribution. */
  sponsors: readonly {
    name: string
    tier?: (TierWithEntitlement & { title?: string }) | null
  }[]
  /**
   * The event's discount codes with usage attached, or `null` when the list
   * could not be read (Tito, or a failed `listDiscounts`). `null` ⇒ sponsor
   * claims are unknown; an EMPTY list is a real answer — no codes exist, so
   * nothing has been redeemed.
   */
  discounts: readonly EventDiscountWithUsage[] | null
  /** Confirmed speakers; `'unknown'` when the speaker read failed. */
  speakerCount: FreeTicketCount
  /**
   * Per-speaker claim state from `joinSpeakerTicketStatus`, or `null` when the
   * invitation records could not be read.
   */
  speakerStatuses: readonly SpeakerTicketStatus[] | null
  /**
   * Organizer seats; `'unknown'` when `getOrganizerCount` returned an error —
   * it answers `{ count: 0, err }` on failure, and a 0 rendered as fact is the
   * same lie in a different column.
   */
  organizerCount: FreeTicketCount
}

/**
 * A `{ count, err }` reader's answer, with the failure preserved.
 *
 * `getOrganizerCount` and `getSpeakers` both answer `0` (or an empty list) on
 * failure with the error alongside. Reading only the count turns a Sanity
 * hiccup into "0 allocated", stated as fact — so the error becomes `'unknown'`
 * here, once, rather than at each call site.
 */
export const countOrUnknown = (result: {
  count: number
  err: Error | null
}): FreeTicketCount => (result.err ? 'unknown' : result.count)

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`

/** Any unknown makes the sum unknown; a total is not a partial total. */
function sumCounts(counts: FreeTicketCount[]): FreeTicketCount {
  return counts.some((c) => c === 'unknown')
    ? 'unknown'
    : (counts as number[]).reduce((a, b) => a + b, 0)
}

function sponsorRow(
  sponsors: FreeTicketAllocationInput['sponsors'],
  discounts: FreeTicketAllocationInput['discounts'],
): FreeAllocationCategory {
  const allocated = sponsors.reduce(
    (total, s) => total + ticketEntitlementOf(s.tier),
    0,
  )
  const names = sponsors.map((s) => s.name).filter(Boolean)

  if (!discounts) {
    return {
      allocated,
      claimed: 'unknown',
      fromProvider: false,
      status:
        'Sponsor comps are 100%-off discount codes; the code list could not be read.',
    }
  }

  let claimed = 0
  let fromProvider = false
  // A code we cannot value (a fixed-amount code — see `removesFullPrice`) could
  // be a comp or a discount on a sale. One of those poisons the whole count.
  let unvalued = 0
  const covered = new Set<string>()

  for (const discount of discounts) {
    const owner = sponsorOwningCode(discount.triggerValue, names)
    if (!owner) continue
    const full = removesFullPrice(discount)
    if (full === 'unknown') {
      unvalued += 1
      continue
    }
    // A partial discount is a PURCHASE at a discount, not a comp.
    if (!full) continue
    covered.add(owner)
    const usage = resolveRedemptionCount(discount)
    claimed += usage.count
    fromProvider ||= usage.fromProvider
  }

  const entitled = sponsors.filter((s) => ticketEntitlementOf(s.tier) > 0)
  const withoutCode = entitled.filter((s) => !covered.has(s.name)).length

  if (unvalued > 0) {
    return {
      allocated,
      claimed: 'unknown',
      fromProvider: false,
      status: `${plural(unvalued, 'sponsor code')} has a fixed amount off, which cannot be told from a comp without list prices.`,
    }
  }

  return {
    allocated,
    claimed,
    fromProvider,
    status:
      withoutCode > 0
        ? `Redemptions of 100%-off sponsor codes; ${plural(withoutCode, 'sponsor')} with an allowance has no code yet.`
        : 'Redemptions of 100%-off sponsor codes.',
  }
}

function speakerRow(
  allocated: FreeTicketCount,
  statuses: FreeTicketAllocationInput['speakerStatuses'],
): FreeAllocationCategory {
  if (!statuses) {
    return {
      allocated,
      claimed: 'unknown',
      fromProvider: false,
      status: 'Speaker ticket claims could not be confirmed.',
    }
  }

  const count = (state: SpeakerTicketStatus['state']) =>
    statuses.filter((s) => s.state === state).length
  const unknown = count('unknown')

  if (unknown > 0) {
    return {
      allocated,
      claimed: 'unknown',
      fromProvider: false,
      // `unknown` is what `joinSpeakerTicketStatus` reports when the provider
      // could not answer. Counting those as unclaimed would put an organizer on
      // the phone to speakers who already hold their ticket.
      status: `${plural(unknown, 'speaker')} could not be checked against the ticket provider.`,
    }
  }

  const invited = count('invited')
  const notInvited = count('not-invited')
  return {
    allocated,
    claimed: count('redeemed'),
    fromProvider: false,
    status: `${plural(invited, 'invitation')} unclaimed · ${plural(notInvited, 'speaker')} never invited.`,
  }
}

export function calculateFreeTicketAllocation(
  input: FreeTicketAllocationInput,
): FreeTicketAllocation {
  const sponsors = sponsorRow(input.sponsors, input.discounts)
  const speakers = speakerRow(input.speakerCount, input.speakerStatuses)
  const organizers: FreeAllocationCategory = {
    allocated: input.organizerCount,
    // NOT 0, and not derivable: `./classification` produces no
    // `grantedBy: 'organizer'` because an organizer comp is indistinguishable
    // from any other zero-priced ticket. It becomes countable the day
    // `ticketTypeRoles` can say which types are grants.
    claimed: 'unknown',
    fromProvider: false,
    status:
      input.organizerCount === 'unknown'
        ? 'The organizer roster could not be read.'
        : 'Organizer comps cannot be told apart from any other free ticket.',
  }

  return {
    sponsors,
    speakers,
    organizers,
    totalAllocated: sumCounts([
      sponsors.allocated,
      speakers.allocated,
      organizers.allocated,
    ]),
    totalClaimed: sumCounts([
      sponsors.claimed,
      speakers.claimed,
      organizers.claimed,
    ]),
  }
}

/**
 * The claim rate, or `null` when there is no honest rate to state — a row we
 * could not count, or nothing allocated to divide by.
 */
export function freeTicketClaimRate(
  allocation: FreeTicketAllocation,
): number | null {
  const { totalClaimed, totalAllocated } = allocation
  if (totalClaimed === 'unknown' || totalAllocated === 'unknown') return null
  if (totalAllocated <= 0) return null
  return (totalClaimed / totalAllocated) * 100
}
