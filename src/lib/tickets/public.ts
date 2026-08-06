import { formatDateSafe } from '@/lib/time'
import {
  resolveTicketingProvider,
  type ConferenceTicketingBinding,
} from './provider'
import { cacheLife, cacheTag } from 'next/cache'

// Public ticket-type shapes now live with the provider contract (they are
// Checkin-shaped — see docs/INTEGRATION_ADAPTERS.md). Re-exported here so
// existing importers of `@/lib/tickets/public` are unaffected.
export type {
  TicketPrice,
  PublicTicketType,
  PublicEventInfo,
} from './provider/types'

import type {
  PublicTicketType,
  PublicEventInfo,
  TicketPrice,
} from './provider/types'

export interface ComplimentaryTicketInfo {
  name: string
  description: string
  link: string | null
}

/**
 * The outcome of a public ticket read — a UNION, because "we have no tickets to
 * show you" had three completely different causes that all collapsed into
 * `null` (#846):
 *
 *  - `ok`              — the vendor answered. `tickets`/`freeTickets` may still
 *                        be empty; that is now a claim we are entitled to make.
 *  - `not-configured`  — this conference has no ticketing binding. Nothing was
 *                        asked of any vendor.
 *  - `unavailable`     — the vendor read FAILED. We do NOT know what tickets
 *                        exist, what they cost, or whether any are on sale.
 *                        Callers must not render an availability claim.
 *
 * The old `null` meant all three at once, so a checkin.no outage rendered as
 * "Tickets for X are not yet available" — cached for hours.
 */
export type PublicTicketTypesResult =
  | {
      status: 'ok'
      event: PublicEventInfo
      /** Public (non-invitation) types with at least one price above zero. */
      tickets: PublicTicketType[]
      /**
       * Public (non-invitation) types with NO price above zero — the ticket
       * list of a free-to-attend event, which used to be filtered away
       * entirely, leaving `tickets: []` and the page claiming that tickets
       * were not yet available (#846).
       */
      freeTickets: PublicTicketType[]
      complimentaryTickets: ComplimentaryTicketInfo[]
    }
  | { status: 'not-configured' }
  | { status: 'unavailable'; error: Error }

export async function getPublicTicketTypes(
  conference: ConferenceTicketingBinding,
): Promise<PublicTicketTypesResult> {
  'use cache'
  cacheLife('hours')
  cacheTag('content:tickets')

  try {
    // Route through the request-boundary resolver (B7) so a tenant's per-org
    // Checkin key is honored end-to-end instead of the platform env creds.
    // The resolver requires the FULL binding (customer + event id) — an event
    // id alone is a configuration error, not a supported state — and an
    // unconfigured conference soft-fails to null. Callers gate on
    // `hasTicketingBinding` (and pass `ticketingBinding(conference)`, keeping
    // this function's 'use cache' key minimal) so the fetch is skipped rather
    // than resolved-and-refused.
    const ticketing = await resolveTicketingProvider(conference)
    if (!ticketing.configured) return { status: 'not-configured' }
    // Pass the provider-shaped eventRef (not a bare event id) so a Tito-bound
    // conference routes to its account/event slugs; Checkin ignores the extra
    // customerId and uses the event id.
    const data = await ticketing.provider.fetchPublicTicketTypes(
      ticketing.eventRef,
    )

    // Public = not invite-only. The list is then SPLIT by price rather than
    // filtered down to the priced ones: a free-to-attend event's entire ticket
    // list is priced at zero, and dropping it made the event indistinguishable
    // from one that has published no tickets at all (#846).
    const publicTickets = data.tickets
      .filter((t) => !t.requiresInvitation)
      .sort((a, b) => a.position - b.position)
    const isPriced = (t: PublicTicketType) =>
      t.price.some((p) => parseFloat(p.price) > 0)

    // Extract complimentary tickets (invite-only or free) that have descriptions
    const complimentaryTickets = extractComplimentaryTickets(data.tickets)

    return {
      status: 'ok',
      event: data.event,
      tickets: publicTickets.filter(isPriced),
      freeTickets: publicTickets.filter((t) => !isPriced(t)),
      complimentaryTickets,
    }
  } catch (error) {
    console.error('Failed to fetch public ticket types:', error)
    return { status: 'unavailable', error: error as Error }
  }
}

/**
 * The ticket types to SHOW the public, and whether they are free.
 *
 * FREE TYPES ARE SHOWN ONLY WHEN THE EVENT IS FREE TO ATTEND — i.e. when it has
 * no priced public type. Deliberate: on a paid event the zero-priced types in a
 * vendor's list are overwhelmingly internal (crew, organizer, comped), and the
 * subset that genuinely belongs on the public page already has a route there
 * via `extractComplimentaryTickets` (speaker/volunteer, description required).
 * Surfacing every free type next to the paid grid would publish the crew list.
 *
 * KNOWN GAP: a paid event with a genuinely public free tier (a free student
 * ticket alongside paid ones) is not covered by this rule and still needs the
 * complimentary route or a priced-at-zero entry.
 */
export function resolveDisplayTickets(result: {
  tickets: PublicTicketType[]
  freeTickets: PublicTicketType[]
}): { tickets: PublicTicketType[]; free: boolean } {
  if (result.tickets.length > 0) {
    return { tickets: result.tickets, free: false }
  }
  return { tickets: result.freeTickets, free: true }
}

/**
 * Determines the sale status of a ticket type based on its visibility window.
 */
export function getTicketSaleStatus(
  ticket: PublicTicketType,
): 'expired' | 'active' | 'upcoming' {
  const now = new Date()

  if (ticket.visibleEndsAt && new Date(ticket.visibleEndsAt) < now) {
    return 'expired'
  }

  if (ticket.visibleStartsAt && new Date(ticket.visibleStartsAt) > now) {
    return 'upcoming'
  }

  return 'active'
}

/**
 * What the PUBLIC can be told about ticket availability, derived from the
 * vendor's ticket list.
 *
 * `unknown` is a first-class outcome, not a failure to handle: the ticket list
 * may be empty, every type may be invitation-only, or the vendor may not report
 * remaining counts at all (Checkin passes `available` through raw and it is
 * frequently `null`). Callers must render `unknown` as "no availability claim",
 * never as sold out — a wrong "Sold out" costs an organizer real ticket sales.
 */
export type TicketAvailability = 'upcoming' | 'on-sale' | 'sold-out' | 'unknown'

/**
 * Derive public ticket availability from the vendor ticket list.
 *
 *  - `sold-out` — tickets ARE in their sale window, every one of them reports a
 *    remaining count, and every count is zero. Requires positive evidence from
 *    the vendor: if even one active type reports `available: null` (unknown) the
 *    answer degrades to `on-sale`.
 *  - `on-sale` — at least one type is inside its sale window.
 *  - `upcoming` — nothing is on sale yet but at least one type has a sale window
 *    that has not opened. This is the "tickets not yet on sale" state.
 *  - `unknown` — no types at all, or every type has expired.
 */
export function getTicketAvailability(
  tickets: PublicTicketType[],
): TicketAvailability {
  const active: PublicTicketType[] = []
  let hasUpcoming = false

  for (const ticket of tickets) {
    // Invitation-only types are not part of the public availability picture:
    // they are neither buyable by a visitor nor evidence of a sell-out.
    if (ticket.requiresInvitation) continue
    const status = getTicketSaleStatus(ticket)
    if (status === 'active') active.push(ticket)
    else if (status === 'upcoming') hasUpcoming = true
  }

  if (active.length > 0) {
    const allReportZero = active.every((t) => t.available === 0)
    return allReportZero ? 'sold-out' : 'on-sale'
  }
  return hasUpcoming ? 'upcoming' : 'unknown'
}

/**
 * Format price in NOK with proper formatting.
 * Prices from Checkin.no are excl. VAT.
 */
export function formatTicketPrice(
  price: string,
  vat: string,
  options: { includeVat?: boolean } = {},
): string {
  const priceNum = parseFloat(price)
  const vatPercent = parseFloat(vat)

  const displayPrice = options.includeVat
    ? priceNum * (1 + vatPercent / 100)
    : priceNum

  return new Intl.NumberFormat('nb-NO', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(displayPrice))
}

export interface LowestTicketPrice {
  /** Numeric price in NOK, excl. VAT (matching the primary price on /tickets) */
  amount: number
  /** Numeric price in NOK incl. VAT (what a consumer actually pays) */
  amountInclVat: number
  /** Price formatted with formatTicketPrice, e.g. "1 234" */
  formatted: string
}

/**
 * Finds the lowest price (excl. VAT, matching the primary price shown on the
 * tickets page) among tickets that are currently on sale. Only each ticket's
 * primary price entry (price[0]) is considered, mirroring what the /tickets
 * pricing UI displays. Returns null when no ticket with a positive price is
 * active. Amounts are rounded to whole kroner like formatTicketPrice.
 */
export function getLowestTicketPrice(
  tickets: PublicTicketType[],
): LowestTicketPrice | null {
  let lowest: TicketPrice | null = null
  let lowestAmount = Infinity

  for (const ticket of tickets) {
    if (getTicketSaleStatus(ticket) !== 'active') continue

    const price = ticket.price[0]
    if (!price) continue
    const amount = parseFloat(price.price)
    if (!Number.isFinite(amount) || amount <= 0) continue
    if (amount < lowestAmount) {
      lowestAmount = amount
      lowest = price
    }
  }

  if (!lowest) return null

  const roundedAmount = Math.round(lowestAmount)
  const vatPercent = parseFloat(lowest.vat)
  const amountInclVat = Number.isFinite(vatPercent)
    ? Math.round(lowestAmount * (1 + vatPercent / 100))
    : roundedAmount

  return {
    amount: roundedAmount,
    amountInclVat,
    formatted: formatTicketPrice(lowest.price, lowest.vat),
  }
}

export interface TicketCategory {
  label: string
  key: string
  tickets: PublicTicketType[]
}

export interface PricingTier {
  label: string
  dateRange: string
  status: 'expired' | 'active' | 'upcoming'
}

/**
 * Groups tickets into a matrix of categories × pricing tiers for grid display.
 *
 * Parses ticket names with the pattern "Tier: Category (details)"
 * e.g. "Early Bird: Conference Only (1 day)" → tier "Early Bird", category "Conference Only (1 day)"
 */
export function buildPricingMatrix(tickets: PublicTicketType[]): {
  categories: TicketCategory[]
  tiers: PricingTier[]
  matrix: (PublicTicketType | null)[][]
} {
  // Parse ticket names into tier + category
  const parsed = tickets.map((t) => {
    const colonIdx = t.name.indexOf(':')
    if (colonIdx > 0) {
      const tier = t.name.substring(0, colonIdx).trim()
      const category = t.name.substring(colonIdx + 1).trim()
      return { ticket: t, tier, category }
    }
    return { ticket: t, tier: null, category: t.name }
  })

  // Collect categories that appear across multiple tiers
  const categoriesPerTier = new Map<string, Set<string>>()
  for (const p of parsed) {
    if (p.tier) {
      if (!categoriesPerTier.has(p.category)) {
        categoriesPerTier.set(p.category, new Set())
      }
      categoriesPerTier.get(p.category)!.add(p.tier)
    }
  }

  // A tier is valid if any of its categories appear in multiple tiers
  const validTiers = new Set<string>()
  for (const p of parsed) {
    if (p.tier) {
      const categoryTiers = categoriesPerTier.get(p.category)
      if (categoryTiers && categoryTiers.size > 1) {
        for (const t of categoryTiers) {
          validTiers.add(t)
        }
      }
    }
  }

  // Re-classify: tickets with invalid tiers become standalone
  const classified = parsed.map((p) => {
    if (p.tier && !validTiers.has(p.tier)) {
      return { ticket: p.ticket, tier: null, category: p.ticket.name }
    }
    return p
  })

  // Extract unique tiers in position order
  const tierOrder: string[] = []
  for (const p of classified) {
    if (p.tier && !tierOrder.includes(p.tier)) {
      tierOrder.push(p.tier)
    }
  }

  // Extract unique categories in position order
  const categoryOrder: string[] = []
  for (const p of classified) {
    if (!categoryOrder.includes(p.category)) {
      categoryOrder.push(p.category)
    }
  }

  // Build tier metadata with date ranges
  const tiers: PricingTier[] = tierOrder.map((tierLabel) => {
    const tierTickets = classified.filter((p) => p.tier === tierLabel)
    const representative = tierTickets[0]?.ticket

    const status = representative
      ? getTicketSaleStatus(representative)
      : 'active'

    let dateRange = ''
    if (representative) {
      const start = representative.visibleStartsAt
        ? formatShortDate(representative.visibleStartsAt)
        : null
      const end = representative.visibleEndsAt
        ? formatShortDate(representative.visibleEndsAt)
        : null
      if (start && end) {
        dateRange = `${start}\u2013${end}`
      } else if (end) {
        dateRange = `Until ${end}`
      } else if (start) {
        dateRange = `From ${start}`
      }
    }

    return { label: tierLabel, dateRange, status }
  })

  // Build categories
  const categories: TicketCategory[] = categoryOrder.map((cat) => ({
    label: cat,
    key: cat.toLowerCase().replace(/\s+/g, '-'),
    tickets: classified.filter((p) => p.category === cat).map((p) => p.ticket),
  }))

  // Build matrix: categories (rows) × tiers (columns)
  const matrix: (PublicTicketType | null)[][] = categoryOrder.map((cat) => {
    return tierOrder.map((tier) => {
      const match = classified.find(
        (p) => p.category === cat && p.tier === tier,
      )
      return match?.ticket ?? null
    })
  })

  return { categories, tiers, matrix }
}

function formatShortDate(isoDate: string): string {
  return formatDateSafe(isoDate)
}

/**
 * Ticket name patterns to surface as complimentary on the public page.
 * Other hidden tickets (crew, organizer, etc.) are excluded.
 */
const COMPLIMENTARY_TICKET_CONFIG: { pattern: RegExp; link: string }[] = [
  { pattern: /speaker/i, link: '/cfp' },
  { pattern: /volunteer/i, link: '/volunteer' },
]

/**
 * Extracts complimentary ticket info (name + description) from tickets
 * that are invite-only or have zero/no price, limited to speaker and
 * volunteer tickets only.
 */
export function extractComplimentaryTickets(
  tickets: PublicTicketType[],
): ComplimentaryTicketInfo[] {
  return tickets
    .filter(
      (t) =>
        t.requiresInvitation ||
        t.price.length === 0 ||
        !t.price.some((p) => parseFloat(p.price) > 0),
    )
    .filter((t) =>
      COMPLIMENTARY_TICKET_CONFIG.some((c) => c.pattern.test(t.name)),
    )
    .filter((t) => t.description && t.description.trim().length > 0)
    .sort((a, b) => a.position - b.position)
    .map((t) => {
      const config = COMPLIMENTARY_TICKET_CONFIG.find((c) =>
        c.pattern.test(t.name),
      )
      return {
        name: t.name,
        description: stripHtml(t.description!),
        link: config?.link ?? null,
      }
    })
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim()
}
