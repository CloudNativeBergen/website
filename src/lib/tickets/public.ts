import { checkinQuery } from './graphql-client'
import { cacheLife, cacheTag } from 'next/cache'

export interface TicketPrice {
  price: string
  vat: string
  description: string | null
  key: string | null
}

export interface PublicTicketType {
  id: number
  name: string
  type: string
  description: string | null
  price: TicketPrice[]
  available: number | null
  requiresInvitation: boolean
  visibleStartsAt: string | null
  visibleEndsAt: string | null
  position: number
}

export interface PublicEventInfo {
  id: number
  name: string
  registrationOpensAt: string | null
  registrationClosesAt: string | null
  currencies: string[]
}

interface FindEventResponse {
  findEventById: {
    id: number
    name: string
    registrationOpensAt: string | null
    registrationClosesAt: string | null
    currencies: string[]
    tickets: PublicTicketType[]
  }
}

const TICKET_TYPES_QUERY = `
  query FindEvent($id: Int!) {
    findEventById(id: $id) {
      id
      name
      registrationOpensAt
      registrationClosesAt
      currencies
      tickets {
        id
        name
        type
        description
        price {
          price
          vat
          description
          key
        }
        available
        requiresInvitation
        visibleStartsAt
        visibleEndsAt
        position
      }
    }
  }
`

async function fetchTicketTypesFromCheckin(
  eventId: number,
): Promise<{ event: PublicEventInfo; tickets: PublicTicketType[] }> {
  const response = await checkinQuery<FindEventResponse>(TICKET_TYPES_QUERY, {
    id: eventId,
  })

  const eventData = response.findEventById
  if (!eventData) {
    throw new Error(`Event with ID ${eventId} not found`)
  }

  return {
    event: {
      id: eventData.id,
      name: eventData.name,
      registrationOpensAt: eventData.registrationOpensAt,
      registrationClosesAt: eventData.registrationClosesAt,
      currencies: eventData.currencies,
    },
    tickets: eventData.tickets || [],
  }
}

export async function getPublicTicketTypes(eventId: number): Promise<{
  event: PublicEventInfo
  tickets: PublicTicketType[]
} | null> {
  'use cache'
  cacheLife('hours')
  cacheTag('content:tickets')

  try {
    const data = await fetchTicketTypesFromCheckin(eventId)

    // Filter to only public tickets: not invite-only, has a price > 0
    const publicTickets = data.tickets
      .filter((t) => !t.requiresInvitation)
      .filter((t) => t.price.length > 0 && parseFloat(t.price[0].price) > 0)
      .sort((a, b) => a.position - b.position)

    return { event: data.event, tickets: publicTickets }
  } catch (error) {
    console.error('Failed to fetch public ticket types:', error)
    return null
  }
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

  // A tier is valid only if multiple tickets share it or if
  // its categories overlap with other tiers' categories
  const tierCounts = new Map<string, number>()
  for (const p of parsed) {
    if (p.tier) {
      tierCounts.set(p.tier, (tierCounts.get(p.tier) || 0) + 1)
    }
  }

  // Collect categories that appear with recognized tiers (count > 0 and shared across tiers)
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
  const date = new Date(isoDate)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
