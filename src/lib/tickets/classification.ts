/**
 * What a ticket actually IS: a seat, an add-on, a purchase, a comp.
 *
 * `/admin/tickets` decided this from price alone — `sum > 0` paid, `sum === 0`
 * free — and that test is wrong in three ways on real data:
 *
 *  - A sponsor comp is minted as a 100%-OFF DISCOUNT CODE, not as a free ticket
 *    type. It is a grant, yet by price it is indistinguishable from an ordinary
 *    zero-priced ticket, while a PARTLY discounted seat — the same sponsor's
 *    code at 20% off — is a purchase that price cannot tell from a full-price
 *    one either. Only the code, joined to the event's discount list, separates
 *    the three.
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
 * read off a field, so it is declared per conference on
 * `conference.ticketTypeRoles`, and an UNCONFIGURED conference behaves exactly
 * as today — every type admits. That assumption is reported (`admitsSource`)
 * rather than made silently, so a surface can say "this count assumes every
 * ticket type seats someone" instead of asserting a number it has no basis for.
 *
 * DECLARATION IS NOT THE ONLY SOURCE OF LIGHT, though it is the only one that
 * moves a number. `./discovery` reads the evidence the page already holds —
 * co-holding above all — and PROPOSES a role for the types nobody declared, so
 * a ticket type created in the vendor UI this morning reports `admitsSource:
 * 'proposed'` with evidence attached instead of sitting silently wrong. A
 * proposal is never applied here: it says how sure the number is, and a human
 * confirming it is what changes the number.
 *
 * WHAT WE DO NOT KNOW STAYS UNKNOWN. `comp` is `boolean | 'unknown'`, in the
 * vocabulary `@/lib/discounts/types` established for `DiscountUsageStatus`: a
 * fact we could not obtain is not a `false`. Most of the `unknown`s come from
 * calling this without the event's discount list — a redeemed code we cannot
 * look up says a code was used, not what it was worth.
 *
 * PRICE IS A LAST RESORT AND NEVER A VETO. It appears in exactly one branch: a
 * ticket with NO code and a positive `sum` was bought, because a grant does not
 * bill anyone. It can never contradict a code. Under Checkin's declared
 * `amountBasis: 'per-ticket'` (see `provider/checkin.ts`) a 100%-off comp lands
 * at `sum: 0`, so the code and the price at least agree that nobody paid — but
 * they agree for a zero-priced ORDINARY ticket too, which is why the code wins.
 * Were that basis ever flipped to `'per-order'`, a comp inside an otherwise paid
 * order would carry a nonzero split and price would call the grant a purchase
 * outright; the code-first order below is correct under either reading, and that
 * is the point of stating it as a rule rather than as a fact about one vendor.
 *
 * Pure: no fetching, no I/O. Callers assemble the context.
 */
import { sponsorOwningCode } from '@/lib/discounts/attribution'
import type { EventDiscount } from '@/lib/discounts/types'
import { parseTicketAmount } from '@/lib/tickets/amount'
// TYPE-ONLY on purpose: `./discovery` imports `removesFullPrice` and `typeKey`
// from here, and a type import is erased, so the cycle never exists at runtime.
import type { TicketTypeProposal } from '@/lib/tickets/discovery'
import { SPEAKER_TICKET_CATEGORY } from '@/lib/tickets/speakerTicketCategory'
import type { EventTicket } from '@/lib/tickets/types'

/**
 * The fields classification actually reads off a ticket.
 *
 * Stated as a `Pick` rather than `EventTicket` so a caller that holds the
 * provider rows in a narrower shape — `lib/budget/income` does — can classify
 * without a cast. An `EventTicket` satisfies it; nothing else here changes.
 */
export type ClassifiableTicket = Pick<
  EventTicket,
  'category' | 'sum' | 'coupon' | 'discount'
>

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

/**
 * WHERE `admits` CAME FROM — three states, not the old declared-or-not boolean.
 *
 *  - `declared`  — a human said so, on `conference.ticketTypeRoles`.
 *  - `proposed`  — nobody declared it, but `./discovery` read the evidence and
 *                  proposed a role. `admits` STILL holds the default, because a
 *                  proposal changes what a surface may say about its own
 *                  certainty and never what it counts; confirming it is an
 *                  organizer's act (and the seam for that is `./discovery`).
 *  - `unknown`   — no declaration and no signal. The `unknown` here is the same
 *                  word `@/lib/discounts/types` and `./public` already use for
 *                  a fact we could not obtain.
 */
export type TicketRoleSource = 'declared' | 'proposed' | 'unknown'

export interface TicketClassification {
  /** Does this ticket put a human in the room? An add-on does not. */
  admits: boolean
  /**
   * Where `admits` came from. Anything but `declared` means `admits` is the
   * "every type seats someone" default — an assumption worth naming on a
   * surface rather than asserting.
   */
  admitsSource: TicketRoleSource
  /** Granted rather than bought. `'unknown'` when the data cannot say. */
  comp: boolean | 'unknown'
  /** Who granted it. `null` whenever `comp` is not `true`, and when unattributable. */
  grantedBy: TicketGrantedBy | null
  /** Does holding this ticket grant workshop access? */
  grantsWorkshop: boolean
}

/** One conference's declaration for one provider ticket-type name. */
export interface TicketTypeRole {
  /** The provider's OWN type name, as it appears in `EventTicket.category`. */
  typeName: string
  /**
   * Does this type seat a human? OPTIONAL, because an entry can exist to answer
   * a different question: declaring `grantsWorkshop` for a type nobody has
   * classified must not fabricate a seating answer on the organizer's behalf —
   * `admitsSource` would then read `'declared'` for a number no human blessed.
   * Absent behaves exactly like NO entry at all: counted as seating one
   * attendee, reported as undeclared.
   */
  admits?: boolean
  /**
   * Does holding this type grant WORKSHOP access? Read by
   * `@/lib/workshop/eligibility`, which owns the rule (including what an
   * unconfigured conference does); nothing in this module consults it.
   *
   * Absent is not `false` at the conference level: a conference where NO type
   * declares `true` is UNCONFIGURED for workshops and falls back to the legacy
   * literal list. Only `true` counts as a declaration, so a lone `false` (or a
   * Studio default) can never lock an event's attendees out.
   */
  grantsWorkshop?: boolean
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
   * only to name a grantor — never to decide that a ticket is a comp,
    grantsWorkshop: role?.grantsWorkshop ?? false, and never
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
  /**
   * Roles `./discovery` PROPOSED from the evidence, for the types nobody
   * declared. They never move `admits` — they move `admitsSource` to
   * `'proposed'`, so a surface can say it is going on a guess it can show you.
   */
  ticketTypeProposals?: readonly TicketTypeProposal[]
}

/**
 * Was this ticket BOUGHT? The paid/free split, from the grant signal.
 *
 * `/admin/tickets` split its two populations with `sum > 0` — the price test
 * this module exists to replace — so a 100%-off sponsor grant that carries a
 * nonzero amount counted as a sale, in revenue, in sellable-ticket progress and
 * in the paid/free toggle. The split belongs to {@link classifyTicket}, so it
 * is derived here and the page filters with it.
 *
 * THE POLICY FOR `comp: 'unknown'`, stated once, here, because the split must
 * put every ticket on one side or the other and `unknown` is a real answer:
 *
 *   an `unknown` ticket falls back to PRICE — positive amount ⇒ paid — and
 *   nothing else does.
 *
 * That is the same last-resort rule the header above states for `comp` itself,
 * one rung further out: price never contradicts a known grant status, it only
 * breaks the tie where there is no grant status to contradict. A redeemed code
 * we could not look up (the common `unknown`) therefore lands exactly where it
 * landed before, so a failed discount read costs certainty and never a number.
 */
export function isPaidTicket(
  ticket: ClassifiableTicket,
  context: TicketClassificationContext = {},
): boolean {
  const { comp } = classifyTicket(ticket, context)
  if (comp === 'unknown') return parseTicketAmount(ticket.sum) > 0
  return comp === false
}

/** Type names compare case- and whitespace-insensitively, like issuance. */
export const typeKey = (name?: string | null) =>
  (name ?? '').trim().toLowerCase()

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
  ticket: ClassifiableTicket,
  context: TicketClassificationContext = {},
): TicketClassification {
  const role = context.ticketTypeRoles?.find(
    (r) => typeKey(r.typeName) === typeKey(ticket.category),
  )
  // An entry that only declares WORKSHOP access has answered nothing about
  // seating, so it must not silence the proposal or claim a declaration.
  const declaredAdmits =
    typeof role?.admits === 'boolean' ? role.admits : undefined
  // A DECLARATION WINS OUTRIGHT: a proposal is only consulted where no human
  // has answered, and even then it is not applied to `admits`.
  const proposal =
    declaredAdmits !== undefined
      ? undefined
      : context.ticketTypeProposals?.find(
          (p) =>
            typeKey(p.typeName) === typeKey(ticket.category) &&
            p.admits !== 'unknown',
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
    // NOT `proposal.admits`: a proposal never moves a count. Until a human
    // confirms it, an undeclared type keeps the "every type seats someone"
    // default and the surface says it is assuming.
    admits: declaredAdmits ?? true,
    admitsSource:
      declaredAdmits !== undefined
        ? 'declared'
        : proposal
          ? 'proposed'
          : 'unknown',
    comp,
    grantsWorkshop:
      workshopAccessOf(ticket.category, context.ticketTypeRoles) === 'granted',
    grantedBy,
  }
}

/**
 * THE MIGRATION BRIDGE, and nothing else.
 *
 * These three names were hardcoded in TWO places — here and in the
 * ticket-sold webhook — as the rule for who may enter `/workshop` and who is
 * emailed the sign-in instructions. They are the FIRST conference's Checkin
 * type names: vendor-owned, renameable in the vendor UI, and meaningless to
 * every other tenant. A rename broke the two copies independently and
 * silently (the gate told a paying attendee to upgrade; the webhook simply
 * stopped mailing). `@/lib/tickets/entitlement` is the same bug, on the
 * counting path, written up in full.
 *
 * It survives ONLY so that deploying the configurable rule does not lock out
 * every existing attendee of every conference that has not declared anything
 * yet. It is consulted exactly when a conference declares NO
 * workshop-granting type, and it is never unioned with a declared set.
 *
 * DELETE IT when every conference with workshops enabled has at least one
 * `ticketTypeRoles` entry with `grantsWorkshop: true`. At that point the
 * legacy branch is dead code for every tenant, and removing it turns an
 * undeclared conference into an honest `'unclassified'` denial instead of a
 * guess made from another conference's vocabulary.
 */
const LEGACY_WORKSHOP_CATEGORIES = [
  'Workshop + Conference (2 days)',
  'Sponsor discount (workshop upgrade)',
  'Speaker ticket',
]

/**
 * What a ticket TYPE says about workshop access.
 *
 *  - `granted`      — this type grants it.
 *  - `denied`       — this type does not. The holder needs a different ticket.
 *  - `unclassified` — nobody at this conference has said either way. The
 *                     holder may well be entitled; an ORGANIZER has to answer.
 *                     Only reachable on a conference that HAS declared roles,
 *                     so it can never be handed to an attendee of a conference
 *                     still running on the bridge above.
 */
export type WorkshopAccess = 'granted' | 'denied' | 'unclassified'

/**
 * THE ONE RULE. The `/workshop` gate and the ticket-sold webhook both call
 * this and nothing else, so they cannot drift apart again.
 *
 * A CONFIGURED CONFERENCE IS AUTHORITATIVE: the moment any type declares
 * `grantsWorkshop: true`, the declared set is the whole answer. It is
 * deliberately NOT unioned with {@link LEGACY_WORKSHOP_CATEGORIES} — a union
 * would keep a renamed type working through the literal, which is precisely
 * the silent breakage this replaces.
 *
 * Names match the way `classifyTicket` matches them ({@link typeKey}: case-
 * and whitespace-insensitive), never by `includes` and never by `===`.
 *
 * Pure: no I/O. Callers pass `conference.ticketTypeRoles`.
 */
export function workshopAccessOf(
  ticketTypeName: string | null | undefined,
  ticketTypeRoles?: readonly TicketTypeRole[] | null,
): WorkshopAccess {
  const key = typeKey(ticketTypeName)
  // A ticket whose type the provider did not name cannot be matched against
  // anything — and must not match a malformed role entry with an empty name.
  if (!key) return 'denied'

  const roles = ticketTypeRoles ?? []
  const declaresWorkshop = roles.some((r) => r.grantsWorkshop === true)

  if (!declaresWorkshop) {
    // Unconfigured: today's behaviour, exactly. No `unclassified` from here —
    // an attendee of a bridge conference who simply lacks a workshop ticket
    // must not be told about our configuration.
    return LEGACY_WORKSHOP_CATEGORIES.some((name) => typeKey(name) === key)
      ? 'granted'
      : 'denied'
  }

  const role = roles.find((r) => typeKey(r.typeName) === key)
  if (!role) return 'unclassified'
  return role.grantsWorkshop === true ? 'granted' : 'denied'
}
