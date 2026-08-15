/**
 * @vitest-environment node
 *
 * Sponsor ticket entitlement: the value, and the shape of lookup that must
 * never come back.
 *
 * THE DEFECT. `src/lib/tickets/processor.ts` and `src/lib/tickets/config.ts`
 * each carried:
 *
 *     export const SPONSOR_TIER_TICKET_ALLOCATION: Record<string, number> = {
 *       Pod: 2, Service: 3, Ingress: 5,
 *     }
 *
 * keyed by sponsor tier TITLE. The tiers were renamed — the live titles are
 * Gold, Platinum, Community Partner Package, Lanyard Sponsorship, Barista Bar
 * Sponsorship and so on — and the map never followed. Every call site read
 * `map[title] || 0`, so a missing key was indistinguishable from a tier that
 * genuinely includes no tickets: no error, no warning, just 0 for every sponsor
 * in the conference. Sponsor discount codes could not be created for anyone,
 * and the sponsor share of the free-ticket budget silently read as zero.
 *
 * It could not have been fixed by editing the map, either. This is a
 * multi-tenant codebase and a second conference's tier names would never have
 * matched — the demo tenant's Gold/Platinum and Bergen's Pod/Service are in the
 * same dataset. A title is a label; it was never an identifier.
 *
 * The second describe block is the guard the coordinator asked for: it reads
 * the SOURCE and fails if a tier-title-keyed allocation map is reintroduced
 * anywhere under `src/`. A unit test cannot catch that, because a reintroduced
 * map would be a NEW symbol that no existing test imports — which is exactly
 * how the original survived (`processor.test.ts` asserted the constant
 * contained what the constant contained, and stayed green throughout).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ticketEntitlementOf } from '@/lib/tickets/entitlement'

describe('ticketEntitlementOf', () => {
  it('reads the number off the tier document', () => {
    expect(ticketEntitlementOf({ ticketEntitlement: 5 })).toBe(5)
  })

  /**
   * The interpretation the whole fix rests on, asserted as a VALUE. Every
   * production tier is in this state until the owner fills in the migration, so
   * "unset" must be a defined 0 rather than `undefined` or `NaN` leaking into
   * capacity arithmetic.
   */
  it.each([
    ['absent', {}],
    ['null', { ticketEntitlement: null }],
    ['undefined', { ticketEntitlement: undefined }],
    ['the tier itself missing', undefined],
    ['the tier itself null', null],
  ])('treats %s as zero', (_label, tier) => {
    const result = ticketEntitlementOf(tier as never)
    expect(result).toBe(0)
    expect(Number.isNaN(result)).toBe(false)
  })

  /**
   * Sanity is schemaless at read time and this number feeds capacity totals, so
   * a hand-edited or migration-damaged document must not poison the arithmetic.
   */
  it.each([
    ['a negative count', { ticketEntitlement: -3 }, 0],
    ['a fractional count', { ticketEntitlement: 2.7 }, 2],
    ['a string', { ticketEntitlement: '4' }, 0],
    ['NaN', { ticketEntitlement: Number.NaN }, 0],
    ['Infinity', { ticketEntitlement: Number.POSITIVE_INFINITY }, 0],
  ])('normalises %s', (_label, tier, expected) => {
    expect(ticketEntitlementOf(tier as never)).toBe(expected)
  })

  /**
   * The titles the retired map knew, carrying entitlements that DISAGREE with
   * it. Restore the title lookup and these answer 2/3/5 instead of 9/0/1.
   */
  it.each([
    ['Pod', 9],
    ['Ingress', 1],
  ])('ignores the tier title %s', (title, entitlement) => {
    // `title` is deliberately extra: the accessor's type does not even admit
    // it, which is itself the point — nothing about the title is consultable.
    expect(
      ticketEntitlementOf({ title, ticketEntitlement: entitlement } as never),
    ).toBe(entitlement)
  })
})

const SRC = join(process.cwd(), 'src')

/**
 * Comments are excluded from the shape scan so that PROSE explaining the
 * retired map — this file, `entitlement.ts`, `sponsor/types.ts` — does not
 * count as a reintroduction. Documenting the defect must stay possible.
 *
 * Deliberately NOT excluded: JSX text and string literals. A user-facing
 * sentence telling organizers "Pod: 2, Service: 3, Ingress: 5" is a real
 * instance of the same defect, and the first run of this guard found exactly
 * that, still being shown on /admin/tickets.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(full) ? [full] : []
  })
}

/**
 * The sponsor tier titles the shape scan knows about, DERIVED rather than
 * hand-listed.
 *
 * The first version of this guard hand-listed six titles — and three of those
 * were the demo tenant's. It therefore missed the main tenant entirely, and a
 * reviewer evaded it in one try by writing the map a real developer would
 * actually write, using the live multi-word titles. A hand-list is precisely
 * the thing that drifted in the first place; repeating that mistake inside the
 * guard against it would be absurd.
 *
 * So the titles come from migration 050's allocation table, which is the
 * repo's one existing census of production tier titles (queried 2026-08). Add
 * a tier there and this guard covers it for free.
 */
function knownTierTitles(): string[] {
  const migration = readFileSync(
    join(
      process.cwd(),
      'migrations',
      '050-sponsortier-add-ticket-entitlement',
      'index.ts',
    ),
    'utf8',
  )
  const table = migration.slice(
    migration.indexOf('TICKET_ENTITLEMENT_BY_TIER_TITLE'),
    migration.indexOf('interface SponsorTier'),
  )
  const titles = [
    ...table.matchAll(/^\s*'?([A-Za-z][^':\n]*?)'?:\s*UNFILLED/gm),
  ].map((match) => match[1])
  // The retired Kubernetes-themed names, in case they are ever dropped from
  // the migration table — reverting to THEM is the likeliest regression.
  return [...new Set([...titles, 'Pod', 'Service', 'Ingress'])]
}

const escapeForRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Does `source` map a known sponsor tier TITLE to a number?
 *
 * Quotes are optional in the pattern so both `Pod: 2` and
 * `'Lanyard Sponsorship': 2` match — the multi-word case is the one the
 * original regex could not express, because it alternated bare words only.
 */
function containsTierTitleMap(source: string): boolean {
  const titles = knownTierTitles().map(escapeForRegExp).join('|')
  return new RegExp(`['"\`]?(${titles})['"\`]?\\s*:\\s*\\d+`).test(
    stripComments(source),
  )
}

describe('no tier-title-keyed ticket allocation may return', () => {
  const files = sourceFiles(SRC)

  it('finds source files to scan at all', () => {
    // Guards the guard: a broken walk would make every check below vacuous.
    expect(files.length).toBeGreaterThan(500)
  })

  it('does not reintroduce the SPONSOR_TIER_TICKET_ALLOCATION symbol', () => {
    // Comments stripped for the same reason as the shape check below: several
    // files NAME the retired symbol while explaining why it is gone.
    const offenders = files.filter((file) =>
      stripComments(readFileSync(file, 'utf8')).includes(
        'SPONSOR_TIER_TICKET_ALLOCATION',
      ),
    )

    expect(
      offenders,
      'SPONSOR_TIER_TICKET_ALLOCATION was a tier-TITLE-keyed map that drifted ' +
        'out of sync with renamed tiers and silently returned 0 for every ' +
        'sponsor. Read sponsorTier.ticketEntitlement via ticketEntitlementOf() ' +
        'instead.',
    ).toEqual([])
  })

  it('derives the real production title set, not a token sample', () => {
    const titles = knownTierTitles()

    // 14 live titles + the three retired names (already among them).
    expect(titles.length).toBeGreaterThanOrEqual(14)
    // The main tenant's titles — absent from the first version of this guard,
    // which is exactly how the evasion below got through.
    expect(titles).toContain('Lanyard Sponsorship')
    expect(titles).toContain('Community Partner Package')
    expect(titles).toContain('Streaming & Video Sponsorship')
    expect(titles).toContain('Gateway (Media Sponsor)')
    // ...and the retired ones.
    expect(titles).toContain('Ingress')
  })

  /**
   * The symbol check alone is too easy to sidestep by renaming, so this looks
   * for the SHAPE: an object literal mapping a known tier title to a number.
   *
   * WHAT THIS DOES AND DOES NOT CATCH — stated plainly, because the previous
   * version of this comment claimed completeness it did not have:
   *
   *  - CAUGHT: an object literal keyed by any title in the derived set, quoted
   *    or bare, single- or multi-word.
   *  - NOT CAUGHT: `new Map([['Gold', 5]])`, a lookup built from an array of
   *    `{ title, tickets }` records, titles assembled from concatenation, or a
   *    tier named after this migration table was last refreshed. Static text
   *    scanning cannot close those, and no amount of regex will.
   *
   * This is a tripwire for the obvious regression, not a proof of absence. The
   * real protection is that `ticketEntitlementOf()` is the only reader and the
   * allocation parameter no longer exists to pass a map into.
   */
  it('does not map any sponsor tier title to a number', () => {
    const offenders = files.filter((file) =>
      containsTierTitleMap(readFileSync(file, 'utf8')),
    )

    expect(
      offenders,
      'A sponsor tier TITLE is being mapped to a ticket count. Titles are ' +
        'tenant-authored labels, not identifiers: they get renamed, and a ' +
        'second tenant never matches. Put the number on the tier document ' +
        '(sponsorTier.ticketEntitlement).',
    ).toEqual([])
  })

  describe('the detector itself', () => {
    /**
     * THE DEMONSTRATED EVASION, kept permanently.
     *
     * A reviewer dropped exactly this into `src/lib/tickets/` and all sixteen
     * guard tests passed: the hand-listed `Community` did not match
     * `'Community Partner Package'`, and the bare-word alternation could not
     * match a quoted multi-word key at all. It is the "helpful refresh of the
     * map" a future developer writes when they notice the tiers were renamed —
     * the single most likely form of this regression, and the one the guard
     * was blind to.
     */
    it('flags a refreshed map using the real live titles', () => {
      expect(
        containsTierTitleMap(`
          export const REFRESHED = {
            'Lanyard Sponsorship': 2,
            'Barista Bar Sponsorship': 1,
            'Community Partner Package': 3,
          }
        `),
      ).toBe(true)
    })

    it.each([
      ['the retired bare-word map', 'const M = { Pod: 2, Service: 3 }'],
      ['double-quoted keys', 'const M = { "Ingress": 5 }'],
      ['whitespace around the colon', "const M = { 'Gold' : 5 }"],
      ['a title containing parentheses', "{ 'Gateway (Media Sponsor)': 1 }"],
      [
        'a title containing an ampersand',
        "{ 'Streaming & Video Sponsorship': 4 }",
      ],
      [
        'organizer-facing help text',
        'based on their tier (Pod: 2, Service: 3)',
      ],
    ])('flags %s', (_label, source) => {
      expect(containsTierTitleMap(source)).toBe(true)
    })

    it.each([
      ['prose in a block comment', '/* the old map was { Pod: 2 } */'],
      ['prose in a line comment', '// e.g. Pod: 2, Service: 3'],
      ['a title with no number', "const TITLES = ['Pod', 'Ingress']"],
      ['an unrelated numeric map', 'const M = { retries: 2, timeout: 30 }'],
      ['the correct accessor', 'ticketEntitlementOf(sponsorData.tier)'],
    ])('does not flag %s', (_label, source) => {
      expect(containsTierTitleMap(source)).toBe(false)
    })
  })
})
