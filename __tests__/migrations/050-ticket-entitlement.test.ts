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
  MAX_DERIVED_TICKETS,
  resolve,
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
    // Norwegian orthography puts a space before the percent sign, and
    // Norwegian organizers author most of these descriptions. Requiring
    // merely whitespace after the digits closed the percentage escape in its
    // en-US spelling only; this is the same defect in the spelling that is
    // MORE likely here, not a variant of it.
    ['a spaced percentage (nb-NO)', ticketPerk('20 % discount on tickets')],
    ['a spaced plus', ticketPerk('2 + tickets')],
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

  it('refuses a year, which no anchor can distinguish from a count', () => {
    // "2026 conference tickets" is perfectly well-formed: digits, space,
    // word. Only a bound catches it, and without one the migration would
    // have written 2026 comp tickets.
    expect(
      deriveFromPerks(ticketPerk('2026 conference tickets')).value,
    ).toBeNull()
    expect(
      deriveFromPerks(ticketPerk(`${MAX_DERIVED_TICKETS + 1} tickets`)).value,
    ).toBeNull()
    expect(
      deriveFromPerks(ticketPerk(`${MAX_DERIVED_TICKETS} tickets`)).value,
    ).toBe(MAX_DERIVED_TICKETS)
  })

  it('reads a non-ASCII leading word rather than refusing it', () => {
    // The lookahead is \p{L}, not [A-Za-z]: a Norwegian description must not
    // be refused for starting with a letter outside ASCII.
    expect(deriveFromPerks(ticketPerk('2 årskort til konferansen')).value).toBe(
      2,
    )
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

/**
 * WHAT `source` DECIDES, and why it is worth pinning here.
 *
 * `assertAllResolved` aborts the whole migration on `'unresolved'` — no
 * document is patched, not even the ones that resolved cleanly. `'table'` with
 * a null value is the opposite: skip this document, write nothing, carry on.
 * The distinction is the refuse-don't-guess contract, and after the `UNFILLED`
 * sentinel was deleted (every row now has a value) it survives only in
 * comments and in this test.
 */
describe('what resolve() reports to the abort check', () => {
  const named = (title: string, perks: SponsorTier['perks']): SponsorTier =>
    ({ _id: 't1', _type: 'sponsorTier', title, perks }) as SponsorTier

  it('aborts the run when a derive-from-perk tier cannot be read', () => {
    // "Gold" is a DERIVE_FROM_PERK row, and a percentage is exactly what the
    // parser refuses rather than guesses at.
    const r = resolve(
      named('Gold', [{ label: 'Tickets', description: '20 %' }]),
    )
    expect(r.source).toBe('unresolved')
    expect(r.value).toBeNull()
  })

  it('aborts on a row left undecided, rather than skipping it', () => {
    // The dangerous direction. A row with no decision yet must stop the whole
    // run; skipping it would quietly leave that tier at no entitlement, which
    // reads as zero comp tickets for a sponsor who paid for some.
    const r = resolve(named('Undecided Tier', []), { 'Undecided Tier': null })
    expect(r.source).toBe('unresolved')
    expect(r.value).toBeNull()
  })

  it('skips a title the table has never heard of, rather than aborting', () => {
    const r = resolve(named('Sausage Sponsorship', []))
    expect(r.source).toBe('table')
    expect(r.value).toBeNull()
  })

  it('takes an explicit integer from the table over the tier’s own perks', () => {
    // Gateway is 1 by decision; its perk prose carries no leading count, so a
    // derive would have failed and aborted the run.
    const r = resolve(
      named('Gateway (Media Sponsor)', [
        { label: 'Event', description: 'Media All-Access Pass' },
      ]),
    )
    expect(r).toMatchObject({ source: 'table', value: 1 })
  })
})
