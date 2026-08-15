/**
 * @vitest-environment node
 *
 * Migration 050 seeds `sponsorTier.ticketEntitlement` by parsing each tier's
 * "Tickets" perk description — English prose like "2 included conference
 * tickets". That is a ONE-OFF convenience under human review, never a runtime
 * strategy (parsing prose is how the original defect happened), but the parser
 * still has to be exactly right once, because it writes to production.
 *
 * The first block is the REAL production strings, queried 2026-08. The second
 * is everything that must refuse to resolve: an unparseable tier has to stay
 * unresolved and stop the migration naming itself, never be guessed at and
 * never default to 0 — a wrong number here silently hands out free tickets.
 */
import { describe, expect, it } from 'vitest'
import {
  deriveFromPerks,
  type SponsorTier,
} from '../../migrations/050-sponsortier-add-ticket-entitlement'

const tier = (perks: SponsorTier['perks']): SponsorTier =>
  ({ _id: 't1', _type: 'sponsorTier', title: 'T', perks }) as SponsorTier

const ticketPerk = (description?: string) =>
  tier([{ label: 'Tickets', description }])

describe('the real production perk descriptions', () => {
  it.each([
    ['Community Partner Package', '2 included conference tickets', 2],
    ['Community', '2 conference tickets', 2],
    ['Gold', '4 conference tickets', 4],
    ['Platinum', '8 conference tickets', 8],
    ['Ingress', '5 tickets', 5],
    ['Pod', '2 tickets', 2],
    ['Service', '3 tickets', 3],
  ])('%s: %j yields %i', (_title, description, expected) => {
    expect(deriveFromPerks(ticketPerk(description)).value).toBe(expected)
  })
})

describe('anything ambiguous stays unresolved', () => {
  it.each([
    ['no Tickets perk', tier([{ label: 'Networking', description: '2' }])],
    ['no perks at all', tier([])],
    ['perks undefined', tier(undefined)],
    ['no description', ticketPerk(undefined)],
    ['a word, not a digit', ticketPerk('two tickets')],
    ['a range', ticketPerk('2-4 tickets')],
    ['a qualifier first', ticketPerk('up to 5 tickets')],
    ['a decimal', ticketPerk('2.5 tickets')],
    ['a number mid-sentence', ticketPerk('includes 3 tickets')],
    // These four defeated an earlier DENYLIST anchor (`(?![\d.,-])`), which
    // accepted every character it had not thought to forbid. The percentage
    // is the dangerous one: a discount perk filed under the plain "Tickets"
    // label would have written 20 comp tickets into production.
    ['a percentage', ticketPerk('20% discount on conference tickets')],
    ['an open-ended plus', ticketPerk('2+ tickets')],
    ['an ordinal', ticketPerk('2nd ticket free')],
    ['a hex-looking prefix', ticketPerk('0x2 tickets')],
    ['a space-grouped thousand', ticketPerk('2 000 tickets')],
    [
      'two Tickets perks disagreeing',
      tier([
        { label: 'Tickets', description: '2 tickets' },
        { label: 'tickets', description: '4 tickets' },
      ]),
    ],
  ])('%s', (_label, doc) => {
    expect(deriveFromPerks(doc).value).toBeNull()
  })

  it('never silently yields 0 for an unparseable description', () => {
    // 0 is a LEGITIMATE allocation, so it must only ever come from a real
    // "0 ..." description — never from a parse failure.
    expect(deriveFromPerks(ticketPerk('no tickets included')).value).toBeNull()
    expect(deriveFromPerks(ticketPerk('0 tickets')).value).toBe(0)
  })
})

describe('the perk label match', () => {
  it.each(['Tickets', 'tickets', 'TICKETS', '  Tickets  '])(
    'accepts %j',
    (label) => {
      expect(deriveFromPerks(tier([{ label, description: '6 t' }])).value).toBe(
        6,
      )
    },
  )

  it('does not match a merely ticket-ish label', () => {
    // "Ticket discounts" is a different perk and must not be read as an
    // entitlement.
    expect(
      deriveFromPerks(
        tier([{ label: 'Ticket discounts', description: '20 %' }]),
      ).value,
    ).toBeNull()
  })
})
