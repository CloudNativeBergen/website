/**
 * TICKET HOLDERS JOINED TO SIGN-UPS (#1333, spec §2 and §4).
 *
 * The one place the workshops page and the reminder (#1334) learn who holds a
 * workshop ticket and who of them has signed up. The reminder sends to the
 * `notSignedUp` group of this join, so the number beside its button and the
 * emails a press sends cannot be computed two ways.
 *
 * THE GATE'S RULE, NOT A COPY OF IT. A holder is a person with at least one
 * ticket for which `workshopAccessOf` answers `granted` by the live roles, and
 * people are told apart by `ticketHolderKey`: both are what
 * `checkWorkshopEligibility` decides with. So the holders are exactly the
 * people the portal admits. Sign-ups are keyed by `canonicalEmail` of their
 * `userEmail`, the form the gate compares the signed-in address in.
 *
 * NOTHING HERE WRITES. A sign-up whose owner holds no workshop ticket (the
 * type was unmarked, the ticket refunded) is flagged, never cancelled.
 */
import { canonicalEmail } from '@/lib/speaker/email'
import {
  marksWorkshopAccess,
  typeKey,
  workshopAccessOf,
  type TicketTypeRole,
} from '@/lib/tickets/classification'
import type { TicketCandidate } from '@/lib/tickets/speakerStatus'
import { ticketHolderKey } from './eligibility'

/** The fields of a sign-up the join reads. */
export interface HolderSignup {
  _id: string
  userEmail?: string | null
  userName?: string | null
  status: string
  workshop?: { _id: string; title?: string | null } | null
}

/** A person holding at least one workshop ticket. */
export interface TicketHolder {
  /** `ticketHolderKey` of their tickets: trimmed, lowercased. */
  email: string
  /** Their workshop tickets, in the provider's order. Never empty. */
  tickets: TicketCandidate[]
  /** Their sign-ups, of any status. */
  signups: HolderSignup[]
}

/** A person with a sign-up and no workshop ticket. */
export interface FlaggedPerson {
  /** `canonicalEmail` of the sign-ups' address. Empty for a sign-up without one. */
  email: string
  /** The name on their first sign-up. */
  name: string
  signups: HolderSignup[]
}

/** The people a not-set ticket type keeps out (spec §3). */
export interface LockedOutType {
  /** The type's name as the first such ticket spells it. */
  typeName: string
  /** People holding it and no workshop ticket. */
  people: number
}

export interface TicketHolderJoin {
  /** Has a type been marked? Otherwise the built-in list decided, as at the gate. */
  configured: boolean
  holders: TicketHolder[]
  /** Holders with at least one confirmed sign-up. */
  confirmed: TicketHolder[]
  /** Holders with sign-ups, none of them confirmed. */
  waitlistOnly: TicketHolder[]
  /** Holders with no sign-up. */
  notSignedUp: TicketHolder[]
  /** People with a sign-up who are not holders. Outside the four above. */
  flagged: FlaggedPerson[]
  lockedOut: LockedOutType[]
}

export function joinTicketHolders({
  tickets,
  signups,
  ticketTypeRoles,
}: {
  tickets: readonly TicketCandidate[]
  signups: readonly HolderSignup[]
  ticketTypeRoles: readonly TicketTypeRole[] | null | undefined
}): TicketHolderJoin {
  const holderMap = new Map<string, TicketHolder>()
  for (const ticket of tickets) {
    if (workshopAccessOf(ticket.category, ticketTypeRoles) !== 'granted') {
      continue
    }
    const email = ticketHolderKey(ticket)
    // An address-less ticket belongs to nobody the gate could admit (spec §9).
    if (!email) continue
    const holder = holderMap.get(email)
    if (holder) holder.tickets.push(ticket)
    else holderMap.set(email, { email, tickets: [ticket], signups: [] })
  }

  const flaggedMap = new Map<string, FlaggedPerson>()
  for (const signup of signups) {
    const email = canonicalEmail(signup.userEmail)
    const holder = email ? holderMap.get(email) : undefined
    if (holder) {
      holder.signups.push(signup)
      continue
    }
    // A sign-up without an address is nobody's: listed on its own.
    const key = email || `signup:${signup._id}`
    const person = flaggedMap.get(key)
    if (person) person.signups.push(signup)
    else
      flaggedMap.set(key, {
        email,
        name: signup.userName?.trim() || '',
        signups: [signup],
      })
  }

  const lockedOutMap = new Map<
    string,
    { typeName: string; people: Set<string> }
  >()
  for (const ticket of tickets) {
    if (workshopAccessOf(ticket.category, ticketTypeRoles) !== 'unclassified') {
      continue
    }
    const email = ticketHolderKey(ticket)
    if (!email || holderMap.has(email)) continue
    const key = typeKey(ticket.category)
    const type = lockedOutMap.get(key)
    if (type) type.people.add(email)
    else
      lockedOutMap.set(key, {
        typeName: ticket.category,
        people: new Set([email]),
      })
  }

  const holders = [...holderMap.values()]
  return {
    configured: marksWorkshopAccess(ticketTypeRoles),
    holders,
    confirmed: holders.filter((h) =>
      h.signups.some((s) => s.status === 'confirmed'),
    ),
    waitlistOnly: holders.filter(
      (h) =>
        h.signups.length > 0 &&
        !h.signups.some((s) => s.status === 'confirmed'),
    ),
    notSignedUp: holders.filter((h) => h.signups.length === 0),
    flagged: [...flaggedMap.values()],
    lockedOut: [...lockedOutMap.values()].map(({ typeName, people }) => ({
      typeName,
      people: people.size,
    })),
  }
}
