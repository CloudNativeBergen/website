import { describe, it, expect } from 'vitest'
import { sponsorOwningCode } from './attribution'

/**
 * The single definition of "whose code is this", used by the admin panel to
 * decide what a sponsor row shows and by `tickets.createDiscountCode` to refuse
 * a standalone code that would take a sponsor's row over. Both sides call THIS,
 * so the edge cases belong here rather than being inferred twice.
 */
const named = (...names: string[]) => names.map((name) => ({ name }))
const owner = (
  code: string | null | undefined,
  sponsors: readonly { name: string; linkedCodes?: readonly string[] }[],
) => sponsorOwningCode(code, sponsors)?.name

describe('sponsorOwningCode — name heuristic (no stored codes)', () => {
  const SPONSORS = named('Acme Cloud', 'NDC')

  it.each([
    ['ACMECLOUD1234', 'Acme Cloud'],
    ['acmecloud1234', 'Acme Cloud'],
    ['SUMMER-ACMECLOUD-25', 'Acme Cloud'],
    ['PARTNER-NDC', 'NDC'],
    ['ndc2026', 'NDC'],
  ])('%s belongs to %s', (code, sponsor) => {
    expect(owner(code, SPONSORS)).toBe(sponsor)
  })

  it.each([
    'COMMUNITY2026',
    // Spaces are stripped from the NAME, not from the code — `acme cloud`
    // never appears in a code, so this does not match.
    'ACME-CLOUD',
    'ACME',
  ])('%s belongs to nobody', (code) => {
    expect(owner(code, SPONSORS)).toBeUndefined()
  })

  /**
   * THE BUG THE EXTRACTION FIXED. The inline version tested
   * `code.includes(''.replace(...))`, and every string contains the empty
   * string — so one sponsor with a blank or whitespace-only name claimed EVERY
   * code on the event, and (now) would have refused every standalone code.
   */
  it.each(['', '   '])('a blank sponsor name (%j) claims nothing', (name) => {
    expect(owner('COMMUNITY2026', named(name))).toBeUndefined()
  })

  it.each([null, undefined, ''])('a missing code (%j) has no owner', (code) => {
    expect(owner(code, SPONSORS)).toBeUndefined()
  })

  it('has no owner when there are no sponsors', () => {
    expect(owner('PARTNER-NDC', [])).toBeUndefined()
  })

  it('returns the FIRST matching sponsor, so the answer is stable', () => {
    // Overlapping names are legitimate ("AI" inside "AI Corp"), and the caller
    // names the sponsor it refused — so the same input must always name the
    // same one rather than depending on iteration luck.
    const overlapping = named('AI Corp', 'AI')
    expect(owner('AICORP1234', overlapping)).toBe('AI Corp')
    expect(owner('AICORP1234', [...overlapping].reverse())).toBe('AI')
  })
})

/**
 * The stored sponsor↔code link (#1262): codes an organizer SENT or ASSIGNED
 * are recorded on the sponsor, and that record outranks the name guess.
 */
describe('sponsorOwningCode — stored link', () => {
  it('a stored code belongs to the sponsor that stores it, whatever it is called', () => {
    const sponsors = [
      { name: 'Acme Cloud' },
      { name: 'Globex', linkedCodes: ['COMP-7Q2'] },
    ]
    expect(owner('COMP-7Q2', sponsors)).toBe('Globex')
  })

  it('matches a stored code case-insensitively and ignoring surrounding space', () => {
    const sponsors = [{ name: 'Globex', linkedCodes: [' comp-7q2 '] }]
    expect(owner('COMP-7Q2', sponsors)).toBe('Globex')
  })

  it('the stored link wins over another sponsor whose NAME the code contains', () => {
    // `ACMECLOUD-FOR-GLOBEX` contains "acmecloud"; by name it is Acme's. It
    // was sent to Globex, and that is the fact the system now holds.
    const sponsors = [
      { name: 'Acme Cloud' },
      { name: 'Globex', linkedCodes: ['ACMECLOUD-FOR-GLOBEX'] },
    ]
    expect(owner('ACMECLOUD-FOR-GLOBEX', sponsors)).toBe('Globex')
  })

  it('a sponsor WITH stored codes is never matched by name substring', () => {
    const sponsors = [{ name: 'NDC', linkedCodes: ['NDC-SPONSOR-1'] }]
    expect(owner('PARTNER-NDC', sponsors)).toBeUndefined()
  })

  it('a sponsor without stored codes still falls back to the name heuristic', () => {
    const sponsors = [
      { name: 'NDC', linkedCodes: ['NDC-SPONSOR-1'] },
      { name: 'Acme Cloud', linkedCodes: [] },
    ]
    expect(owner('ACMECLOUD1234', sponsors)).toBe('Acme Cloud')
  })

  it('returns the claimant itself, so callers can key on an id rather than a name', () => {
    const globex = { id: 'sponsor-globex', name: 'Globex', linkedCodes: ['X1'] }
    expect(sponsorOwningCode('x1', [globex])).toBe(globex)
  })
})
