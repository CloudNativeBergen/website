import { describe, it, expect } from 'vitest'
import { sponsorOwningCode } from './attribution'

/**
 * The single definition of "whose code is this", used by the admin panel to
 * decide what a sponsor row shows and by `tickets.createDiscountCode` to refuse
 * a standalone code that would take a sponsor's row over. Both sides call THIS,
 * so the edge cases belong here rather than being inferred twice.
 */
describe('sponsorOwningCode', () => {
  const SPONSORS = ['Acme Cloud', 'NDC']

  it.each([
    ['ACMECLOUD1234', 'Acme Cloud'],
    ['acmecloud1234', 'Acme Cloud'],
    ['SUMMER-ACMECLOUD-25', 'Acme Cloud'],
    ['PARTNER-NDC', 'NDC'],
    ['ndc2026', 'NDC'],
  ])('%s belongs to %s', (code, sponsor) => {
    expect(sponsorOwningCode(code, SPONSORS)).toBe(sponsor)
  })

  it.each([
    'COMMUNITY2026',
    // Spaces are stripped from the NAME, not from the code — `acme cloud`
    // never appears in a code, so this does not match.
    'ACME-CLOUD',
    'ACME',
  ])('%s belongs to nobody', (code) => {
    expect(sponsorOwningCode(code, SPONSORS)).toBeUndefined()
  })

  /**
   * THE BUG THE EXTRACTION FIXED. The inline version tested
   * `code.includes(''.replace(...))`, and every string contains the empty
   * string — so one sponsor with a blank or whitespace-only name claimed EVERY
   * code on the event, and (now) would have refused every standalone code.
   */
  it.each(['', '   '])('a blank sponsor name (%j) claims nothing', (name) => {
    expect(sponsorOwningCode('COMMUNITY2026', [name])).toBeUndefined()
  })

  it.each([null, undefined, ''])('a missing code (%j) has no owner', (code) => {
    expect(sponsorOwningCode(code, SPONSORS)).toBeUndefined()
  })

  it('has no owner when there are no sponsors', () => {
    expect(sponsorOwningCode('PARTNER-NDC', [])).toBeUndefined()
  })

  it('returns the FIRST matching sponsor, so the answer is stable', () => {
    // Overlapping names are legitimate ("AI" inside "AI Corp"), and the caller
    // names the sponsor it refused — so the same input must always name the
    // same one rather than depending on iteration luck.
    const overlapping = ['AI Corp', 'AI']
    expect(sponsorOwningCode('AICORP1234', overlapping)).toBe('AI Corp')
    expect(sponsorOwningCode('AICORP1234', [...overlapping].reverse())).toBe(
      'AI',
    )
  })
})
