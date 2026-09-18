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
 *  - SPONSOR comps are minted as a 100%-off DISCOUNT CODE (see
 *    `../discounts/attribution`), so a sponsor comp is a REDEMPTION, and price
 *    cannot tell one from an ordinary free ticket or from a partly-discounted
 *    purchase. Counting zero-priced rows instead of redemptions reported 0 of 40
 *    claimed, as part of a number that said otherwise.
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
 * renders as 0 and never enters a percentage.
 *
 * THE TOTAL IS A PARTIAL TOTAL, AND SAYS SO. The organizer row is `'unknown'`
 * on every tenant, always — so a total that goes unknown the moment any row does
 * would be unknown forever, and the card would permanently read `? / N` while
 * the two rows we CAN count sit right above it. Instead `totalClaimed` sums the
 * countable rows, `claimedAllocated` is the allocation over exactly those same
 * rows (so the rate divides like by like), and `claimedCovers` names them so no
 * surface can present the partial total as the whole event.
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
  /** Every category's allowance. `'unknown'` if any one could not be read. */
  totalAllocated: FreeTicketCount
  /**
   * Claims summed over the categories that CAN be counted — `claimedCovers`
   * names them. `'unknown'` only when NONE can be counted, never because one
   * cannot: the organizer row is uncountable by construction.
   */
  totalClaimed: FreeTicketCount
  /**
   * The allowance of exactly the categories `totalClaimed` covers, so a rate
   * divides like by like. `'unknown'` if one of those allowances is.
   */
  claimedAllocated: FreeTicketCount
  /** The categories `totalClaimed` covers, in table order, for prose. */
  claimedCovers: readonly string[]
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

  // The rows we can actually count, in table order. Excluding a row from the
  // total is NOT the same as counting it as zero: it leaves `claimedCovers`,
  // which every surface has to render beside the number.
  const counted = (
    [
      ['sponsors', sponsors],
      ['speakers', speakers],
      ['organizers', organizers],
    ] as const
  ).filter(([, row]) => row.claimed !== 'unknown')

  return {
    sponsors,
    speakers,
    organizers,
    totalAllocated: sumCounts([
      sponsors.allocated,
      speakers.allocated,
      organizers.allocated,
    ]),
    totalClaimed: counted.length
      ? sumCounts(counted.map(([, row]) => row.claimed))
      : 'unknown',
    claimedAllocated: counted.length
      ? sumCounts(counted.map(([, row]) => row.allocated))
      : 'unknown',
    claimedCovers: counted.map(([name]) => name),
  }
}

/**
 * The claim rate over the categories `totalClaimed` covers, or `null` when
 * there is no honest rate to state — nothing countable, an allowance we could
 * not read, or nothing allocated to divide by.
 *
 * It is a rate for `claimedCovers`, NOT for the event, so a surface must name
 * the coverage alongside it (see {@link claimedCoverageLabel}).
 */
export function freeTicketClaimRate(
  allocation: FreeTicketAllocation,
): number | null {
  const { totalClaimed, claimedAllocated } = allocation
  if (totalClaimed === 'unknown' || claimedAllocated === 'unknown') return null
  if (claimedAllocated <= 0) return null
  return (totalClaimed / claimedAllocated) * 100
}

/** Every category a claimed total could cover. */
const CATEGORIES = ['sponsors', 'speakers', 'organizers'] as const

/** Which categories the claimed total covers, as prose: 'sponsors and speakers'. */
export function claimedCoverageLabel(allocation: FreeTicketAllocation): string {
  if (allocation.claimedCovers.length === 0) return 'no category'
  return new Intl.ListFormat('en', {
    style: 'long',
    type: 'conjunction',
  }).format([...allocation.claimedCovers])
}

/**
 * How the claimed total is LIMITED, for a surface to print beside it — or
 * `null` when it covers every category and there is nothing to qualify.
 */
export function claimedCoverageNote(
  allocation: FreeTicketAllocation,
): string | null {
  if (allocation.claimedCovers.length === CATEGORIES.length) return null
  return `${claimedCoverageLabel(allocation)} only`
}
