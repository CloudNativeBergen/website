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

  /**
   * The symbol check alone is too easy to sidestep by renaming. This looks for
   * the SHAPE: an object literal that maps known sponsor tier titles to
   * numbers. Both the retired Kubernetes-themed titles and the current ones are
   * listed, so neither a revert nor a "helpful" refresh of the map passes.
   */
  it('does not map any sponsor tier title to a number', () => {
    const TIER_TITLES = [
      'Pod',
      'Service',
      'Ingress',
      'Gold',
      'Platinum',
      'Community',
    ]
    // e.g. `Pod: 2` or `'Gold': 5` or `"Ingress" : 10`
    const titleToNumber = new RegExp(
      `['"\`]?(${TIER_TITLES.join('|')})['"\`]?\\s*:\\s*\\d+`,
    )

    const offenders = files.filter((file) =>
      titleToNumber.test(stripComments(readFileSync(file, 'utf8'))),
    )

    expect(
      offenders,
      'A sponsor tier TITLE is being mapped to a ticket count. Titles are ' +
        'tenant-authored labels, not identifiers: they get renamed, and a ' +
        'second tenant never matches. Put the number on the tier document ' +
        '(sponsorTier.ticketEntitlement).',
    ).toEqual([])
  })
})
