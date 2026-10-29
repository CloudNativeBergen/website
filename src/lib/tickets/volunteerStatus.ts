import { normalizeEmail } from '@/lib/speaker/email'
import type {
  ConferenceTicketingBinding,
  PublicTicketType,
  ResolvedTicketing,
} from '@/lib/tickets/provider'
import {
  fetchEventTicketCandidates,
  type TicketCandidate,
} from '@/lib/tickets/speakerStatus'

import { VOLUNTEER_TICKET_CATEGORY } from '@/lib/tickets/speakerTicketCategory'

export { VOLUNTEER_TICKET_CATEGORY }

const VOLUNTEER_CATEGORY_PATTERN = /volunteer|frivillig/i

const categoryKey = (name?: string | null) => (name ?? '').trim().toLowerCase()

/**
 * Identify a conference's volunteer ticket type from provider ticket types.
 * Prefers invitation-gated types first, then lowest position.
 */
export function findVolunteerTicketType<
  T extends {
    name: string
    requiresInvitation?: boolean
    position?: number
  },
>(types: readonly T[]): T | undefined {
  const matches = types.filter((t) => VOLUNTEER_CATEGORY_PATTERN.test(t.name))
  if (matches.length <= 1) return matches[0]
  return [...matches].sort((a, b) => {
    if (Boolean(a.requiresInvitation) !== Boolean(b.requiresInvitation)) {
      return a.requiresInvitation ? -1 : 1
    }
    return (
      (a.position ?? Number.MAX_SAFE_INTEGER) -
      (b.position ?? Number.MAX_SAFE_INTEGER)
    )
  })[0]
}

const VOLUNTEER_TYPE_TTL_MS = 30_000
const volunteerTypeCache = new Map<
  string,
  { expiresAt: number; type: Promise<PublicTicketType | undefined> }
>()

export function __resetVolunteerTicketTypeCache() {
  volunteerTypeCache.clear()
}

export function resolveVolunteerTicketType(
  ticketing: Extract<ResolvedTicketing, { configured: true }>,
  orgId?: string,
): Promise<PublicTicketType | undefined> {
  const lookup = () =>
    ticketing.provider
      .fetchPublicTicketTypes(ticketing.eventRef)
      .then(({ tickets }) => findVolunteerTicketType(tickets))

  if (!orgId) return lookup()

  const key = `${orgId}:${JSON.stringify(ticketing.eventRef)}`
  const now = Date.now()
  const cached = volunteerTypeCache.get(key)
  if (cached && cached.expiresAt > now) return cached.type

  const type = lookup().catch((err) => {
    if (volunteerTypeCache.get(key)?.type === type) {
      volunteerTypeCache.delete(key)
    }
    throw err
  })
  volunteerTypeCache.set(key, {
    expiresAt: now + VOLUNTEER_TYPE_TTL_MS,
    type,
  })
  return type
}

export type VolunteerTicketState =
  'redeemed' | 'invited' | 'not-invited' | 'unknown'

export interface VolunteerTicketInput {
  _id: string
  email?: string | null
  approvalEmailSentAt?: string | null
}

export interface VolunteerTicketStatus {
  volunteerId: string
  state: VolunteerTicketState
  invitedAt?: string
  ticketId?: number
  orderId?: number
  category?: string
  manageUrl?: string
}

/**
 * Build a map of normalized email -> TicketCandidate for volunteer-category tickets.
 * Matches any category containing "volunteer" / "frivillig" (case-insensitive) plus
 * any explicit category names passed in `categories`.
 */
export function redeemedVolunteerEmails(
  candidates: readonly TicketCandidate[],
  categories: Iterable<string> = [VOLUNTEER_TICKET_CATEGORY],
): Map<string, TicketCandidate> {
  const wanted = new Set([...categories].map(categoryKey).filter(Boolean))
  const emails = new Map<string, TicketCandidate>()
  for (const candidate of candidates) {
    const key = categoryKey(candidate.category)
    if (!key) continue
    if (!wanted.has(key) && !VOLUNTEER_CATEGORY_PATTERN.test(key)) continue
    const existing = emails.get(candidate.email)
    if (!existing || candidate.orderId >= existing.orderId) {
      emails.set(candidate.email, candidate)
    }
  }
  return emails
}

/**
 * Join conference volunteers against the redeemed volunteer ticket map.
 * When `redeemed === null` (provider unconfigured or unreachable), every
 * volunteer reports `'unknown'` rather than appearing unclaimed.
 * Note: `'invited'` indicates an approval email was recorded (`approvalEmailSentAt`),
 * though the email may or may not have included a ticket claim link.
 */
export function joinVolunteerTicketStatus(
  volunteers: readonly VolunteerTicketInput[],
  redeemed: Map<string, TicketCandidate> | null,
  conference?: ConferenceTicketingBinding,
): VolunteerTicketStatus[] {
  return volunteers.map((volunteer) => {
    const invitedAt = volunteer.approvalEmailSentAt ?? undefined
    if (!redeemed) {
      return {
        volunteerId: volunteer._id,
        state: 'unknown',
        invitedAt,
      }
    }
    const normalized = normalizeEmail(volunteer.email)
    const foundTicket = normalized ? redeemed.get(normalized) : undefined
    return {
      volunteerId: volunteer._id,
      state: foundTicket ? 'redeemed' : invitedAt ? 'invited' : 'not-invited',
      invitedAt,
      ticketId: foundTicket?.ticketId,
      orderId: foundTicket?.orderId,
      category: foundTicket?.category,
      manageUrl:
        foundTicket &&
        (conference?.ticketingProvider ?? 'checkin') === 'checkin' &&
        conference?.checkinCustomerId &&
        conference?.checkinEventId
          ? `https://app.checkin.no/customer/${conference.checkinCustomerId}/event/${conference.checkinEventId}/orders/order?id=${foundTicket.orderId}`
          : undefined,
    }
  })
}

/**
 * Fetch the redeemed volunteer ticket map for a conference using the shared
 * 30s-memoized `fetchEventTicketCandidates` cache, or `null` if unavailable.
 */
export async function fetchRedeemedVolunteerEmails(
  conference: ConferenceTicketingBinding,
): Promise<Map<string, TicketCandidate> | null> {
  const candidates = await fetchEventTicketCandidates(conference)
  if (!candidates) return null
  return redeemedVolunteerEmails(candidates)
}
