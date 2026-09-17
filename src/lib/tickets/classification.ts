/**
 * What a ticket actually IS: a seat, an add-on, a purchase, a comp.
 *
 * `/admin/tickets` decided this from price alone — `sum > 0` paid, `sum === 0`
 * free — and that test is wrong in three ways on real data:
 *
 *  - A sponsor comp is minted as a 100%-OFF DISCOUNT CODE, not as a free ticket
 *    type. It is a grant, but it is indistinguishable from a discounted
 *    purchase by price, and a comp issued inside an otherwise paid order can
 *    carry a NONZERO `sum` (the order's per-ticket split), so price calls it
 *    paid.
 *  - "Sponsor discount (workshop upgrade)" is an ADD-ON to a seat its holder
 *    already has. Priced or not, it is not a person in the room, and counting
 *    it inflates the headcount by exactly the number of upgrades sold.
 *  - A zero-priced ticket is not evidence of a grant either: on a free-to-attend
 *    event every ticket is zero.
 *
 * NOTHING HERE IS KEYED ON A TICKET-TYPE NAME. `./entitlement` records what
 * happened the last time this codebase kept a title-keyed map (tier names were
 * renamed, `map[title] || 0` returned 0 for every sponsor, and nothing errored);
 * a literal list of "Sponsor discount …" strings would be the same bug, and in a
 * multi-tenant codebase it would be wrong for the second conference on day one.
 * So every signal below comes from data:
 *
 *  - the REDEMPTION CODE on the ticket (`coupon` / `discount`) joined to the
 *    event's own `EventDiscount` list, which carries `type` and `value` — a
 *    100%-off code is therefore identifiable as data, per tenant;
 *  - the sponsor↔code link from `@/lib/discounts/attribution`, reused rather
 *    than re-derived (see the hazard note below);
 *  - the speaker ticket type from `findSpeakerTicketType` in `./speakerStatus` —
 *    the SAME derivation issuance uses (`requiresInvitation && /speaker/i`),
 *    with the same historical-literal fallback;
 *  - per-conference `ticketTypeRoles`, for the one question no provider field
 *    answers (below).
 *
 * WHY `admits` IS CONFIGURATION. No provider exposes "this type seats a human".
 * Checkin and Tito both model an upgrade exactly like a ticket. It cannot be
 * derived, so it is declared per conference on `conference.ticketTypeRoles`, and
 * an UNCONFIGURED conference behaves exactly as today — every type admits. That
 * assumption is reported (`admitsConfigured: false`) rather than made silently,
 * so a surface can say "this count assumes every ticket type seats someone"
 * instead of asserting a number it has no basis for.
 *
 * WHAT WE DO NOT KNOW STAYS UNKNOWN. `comp` is `boolean | 'unknown'`, in the
 * vocabulary `@/lib/discounts/types` established for `DiscountUsageStatus`: a
 * fact we could not obtain is not a `false`. Most of the `unknown`s come from
 * calling this without the event's discount list — a redeemed code we cannot
 * look up says a code was used, not what it was worth.
 *
 * PRICE IS A LAST RESORT AND NEVER A VETO. It appears in exactly one branch: a
 * ticket with NO code and a positive `sum` was bought, because a grant does not
 * bill anyone. It can never contradict a code — the "comp with a nonzero sum"
 * case above is precisely where price lies.
 *
 * Pure: no fetching, no I/O. Callers assemble the context.
 */
import { sponsorOwningCode } from '@/lib/discounts/attribution'
import type { EventDiscount } from '@/lib/discounts/types'
import { parseTicketAmount } from '@/lib/tickets/amount'
import { SPEAKER_TICKET_CATEGORY } from '@/lib/tickets/speakerStatus'
import type { EventTicket } from '@/lib/tickets/types'

/** Who granted a ticket, when it was granted rather than bought. */
export type TicketGrantedBy =
  | 'sponsor'
  | 'speaker'
  /**
   * NOTHING PRODUCES THIS YET, deliberately. An organizer/crew comp is
   * indistinguishable in provider data from any other zero-priced ticket, and
   * guessing it from price is the bug this module exists to remove. It becomes
   * derivable the day `ticketTypeRoles` grows a `grants` field; until then such
   * tickets classify as `comp: 'unknown'`, `grantedBy: null`.
   */
  | 'organizer'

export interface TicketClassification {
  /** Does this ticket put a human in the room? An add-on does not. */
  admits: boolean
  /**
   * Whether `admits` was DECLARED for this type or assumed. `false` means the
   * conference has no `ticketTypeRoles` entry for it and `admits` defaulted to
   * `true` — today's behaviour, but an assumption worth naming on a surface.
   */
  admitsConfigured: boolean
  /** Granted rather than bought. `'unknown'` when the data cannot say. */
  comp: boolean | 'unknown'
  /** Who granted it. `null` whenever `comp` is not `true`, and when unattributable. */
  grantedBy: TicketGrantedBy | null
}

/** One conference's declaration for one provider ticket-type name. */
export interface TicketTypeRole {
  /** The provider's OWN type name, as it appears in `EventTicket.category`. */
  typeName: string
  admits: boolean
}

export interface TicketClassificationContext {
  /**
   * The event's discount codes. ABSENT (or missing the ticket's code) means the
   * code's worth is unknown — never that it discounted nothing.
   */
  discounts?: readonly EventDiscount[]
  /**
   * Sponsor names for `sponsorOwningCode`. ABSENT ⇒ no ticket is attributed to
   * a sponsor; attribution is substring matching, and its header documents how
   * an accidental match TAKES OVER the wrong sponsor's row. So it is used here
   * only to name a grantor — never to decide that a ticket is a comp, and never
   * to decide `admits`. A wrong match mislabels a grantor; it cannot move the
   * headcount.
   */
  sponsorNames?: readonly string[]
  /**
   * The name of the invitation-gated speaker type, from `findSpeakerTicketType`
   * over the event's ticket types. Absent falls back to the historical literal
   * only, exactly as `redeemedSpeakerEmails` does.
   */
  speakerTicketTypeName?: string | null
  /** `conference.ticketTypeRoles`. Absent/empty ⇒ every type admits. */
  ticketTypeRoles?: readonly TicketTypeRole[]
}

/** Type names compare case- and whitespace-insensitively, like issuance. */
const typeKey = (name?: string | null) => (name ?? '').trim().toLowerCase()

/**
 * Does this discount remove the WHOLE price? Read as data, never by name.
 *
 * Only a percentage can be answered from the code alone. A fixed-amount code
 * would need the ticket type's list price joined to it — the same join
 * `DiscountUsage.totalPaid` declines to make, and for the same reason — so it
 * answers `'unknown'` rather than guessing in either direction. Checkin mints
 * only `percent` codes today (`provider/checkin.ts`), so this branch is for
 * codes an organizer made by hand in the vendor UI.
 */
export function removesFullPrice(discount: EventDiscount): boolean | 'unknown' {
  if (discount.type.trim().toLowerCase() !== 'percent') return 'unknown'
  return parseTicketAmount(discount.value) >= 100
}

function findDiscount(
  code: string,
  discounts: readonly EventDiscount[] | undefined,
): EventDiscount | undefined {
  if (!discounts) return undefined
  const wanted = code.trim().toLowerCase()
  return discounts.find(
    (d) => (d.triggerValue ?? '').trim().toLowerCase() === wanted,
  )
}

/**
 * Classify one ticket. Never throws; an input it cannot read yields `unknown`
 * rather than a confident default.
 */
export function classifyTicket(
  ticket: EventTicket,
  context: TicketClassificationContext = {},
): TicketClassification {
  const role = context.ticketTypeRoles?.find(
    (r) => typeKey(r.typeName) === typeKey(ticket.category),
  )

  // Same precedence as `calculateDiscountUsage`: `coupon` first, `discount` as
  // the alternate field the provider fills.
  const code = (ticket.coupon || ticket.discount || '').trim()
  const discount = code ? findDiscount(code, context.discounts) : undefined

  const speakerTypes = new Set(
    [context.speakerTicketTypeName, SPEAKER_TICKET_CATEGORY].map(typeKey),
  )
  speakerTypes.delete('')
  const isSpeakerType = speakerTypes.has(typeKey(ticket.category))

  let comp: boolean | 'unknown'
  let grantedBy: TicketGrantedBy | null = null

  if (isSpeakerType) {
    // The speaker type is invitation-gated by construction — a ticket in it was
    // issued, not sold, whatever it cost.
    comp = true
    grantedBy = 'speaker'
  } else if (discount) {
    // A partial discount is a PURCHASE: the holder paid, at a discount. Naming
    // the sponsor whose code it is as the GRANTOR would count a sale as a
    // giveaway, so attribution follows `comp === true` only.
    comp = removesFullPrice(discount)
    grantedBy =
      comp === true &&
      context.sponsorNames &&
      sponsorOwningCode(code, context.sponsorNames)
        ? 'sponsor'
        : null
  } else if (code) {
    // A code was redeemed and we cannot see what it was worth. Not a zero.
    comp = 'unknown'
  } else if (parseTicketAmount(ticket.sum) > 0) {
    // LAST-RESORT PRICE, and the only place it decides anything: money changed
    // hands and no code was involved, so nobody granted this.
    comp = false
  } else {
    // Zero-priced, no code: an organizer comp and an ordinary ticket at a
    // free-to-attend event look identical here.
    comp = 'unknown'
  }

  return {
    admits: role ? role.admits : true,
    admitsConfigured: role !== undefined,
    comp,
    grantedBy,
  }
}
